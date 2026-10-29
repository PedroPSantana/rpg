import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/server/db";
import { createCampaign, deleteCampaign, getCampaignView, listCampaigns, narrateAction, rollPending, saveCharacter, submitAction, toClientView, updateCampaign, ServiceError, type SubmitInput, type SubmitResult } from "@/server/campaigns";
import { GmOrchestrator } from "@/modules/gm/orchestrator";
import { OfflineGmProvider } from "@/modules/gm/offline";
import type { GmProvider } from "@/modules/gm/provider";
import { combatentePolicial } from "@/modules/rules/systems/ordem-paranormal/__tests__/fixtures";
import { assertSides } from "@/modules/rules/core/random";

const url = process.env.TEST_DATABASE_URL;
const db = url ? createDb(url) : (null as never);
const maxRng = { die: (s: number) => (assertSides(s), s) };
const offline = new GmOrchestrator(new OfflineGmProvider(), { retries: 0 });
const key = () => `k_${crypto.randomUUID().replace(/-/g, "")}`;

/** Submits an action and clicks every roll it asks for, like the player would. */
async function play(gm: GmOrchestrator, playerId: string, campaignId: string, input: SubmitInput, rng = maxRng): Promise<SubmitResult & { clicks: number }> {
  let res = await submitAction(db, gm, playerId, campaignId, input, rng);
  let clicks = 0;
  while (res.status === "roll") {
    res = await rollPending(db, gm, playerId, campaignId, { actionId: res.actionId!, index: res.request!.index }, rng);
    clicks++;
  }
  return { ...res, clicks };
}

async function player() {
  return db.player.create({ data: {} });
}

async function campaignWithCharacter(seed = crypto.randomUUID()) {
  const p = await player();
  const id = await createCampaign(db, p.id, { name: "Teste", systemId: "ordem-paranormal", editionId: "op-core", seed });
  await saveCharacter(db, p.id, id, combatentePolicial);
  return { playerId: p.id, campaignId: id };
}

describe.skipIf(!url)("campaign service (PostgreSQL)", () => {
  beforeAll(async () => {
    await db.player.deleteMany({});
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it("creates a campaign with an original blueprint and rejects unavailable systems", async () => {
    const p = await player();
    const id = await createCampaign(db, p.id, { name: "", systemId: "ordem-paranormal", editionId: "op-core" });
    const list = await listCampaigns(db, p.id);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(id);
    await expect(createCampaign(db, p.id, { name: "x", systemId: "tormenta20", editionId: "t20" })).rejects.toBeInstanceOf(ServiceError);
  });

  it("validates characters server-side and explains invalid choices", async () => {
    const p = await player();
    const id = await createCampaign(db, p.id, { name: "x", systemId: "ordem-paranormal", editionId: "op-core" });
    await expect(saveCharacter(db, p.id, id, { ...combatentePolicial, attributes: { AGI: 3, FOR: 3, INT: 3, PRE: 3, VIG: 3 } })).rejects.toMatchObject({ status: 422 });
    expect((await saveCharacter(db, p.id, id, combatentePolicial)).mechanicsLocked).toBe(false);
  });

  it("duplicate-action prevention: the same idempotency key commits once", async () => {
    const { playerId, campaignId } = await campaignWithCharacter();
    const view = await getCampaignView(db, playerId, campaignId);
    const clue = view.blueprint.clues.find((c) => c.id === "pista-rastro")!;
    const k = key();
    const input = { idempotencyKey: k, action: { type: "interact" as const, objectId: clue.objectId, verb: "search" as const, powers: [] } };
    const first = await play(offline, playerId, campaignId, input);
    const second = await submitAction(db, offline, playerId, campaignId, input, maxRng);
    expect(first.status).toBe("resolved");
    expect(second.status).toBe("duplicate");
    expect(second.actionId).toBe(first.actionId);
    const after = await getCampaignView(db, playerId, campaignId);
    // One version for the pending roll, one for the commit.
    expect(after.campaign.version).toBe(2);
    expect(await db.actionLog.count({ where: { campaignId } })).toBe(1);
    expect(await db.rollLog.count({ where: { campaignId } })).toBe(1);
  });

  it("save and resume: state, map and character persist across loads", async () => {
    const { playerId, campaignId } = await campaignWithCharacter();
    const view = await getCampaignView(db, playerId, campaignId);
    const start = view.state.maps.exterior.player;
    await submitAction(db, offline, playerId, campaignId, { idempotencyKey: key(), action: { type: "move", to: { x: start.x + 1, y: start.y } } }, maxRng);
    const talked = await play(offline, playerId, campaignId, { idempotencyKey: key(), action: { type: "talk", npcId: "testemunha", approach: "persuadir", powers: [] } });
    const resumed = await getCampaignView(db, playerId, campaignId);
    expect(resumed.state.clues["pista-testemunho"].discovered).toBe(true);
    expect(resumed.state.npcs.testemunha.talked).toBe(true);
    expect(resumed.narrative.some((n) => n.role === "GM")).toBe(true);
    expect(resumed.campaign.version).toBe(2 + talked.clicks);
    expect(resumed.state.journal.some((j) => j.npcId === "testemunha")).toBe(true);
  });

  it("campaign isolation: players cannot read or act on others' campaigns; new campaigns get new state", async () => {
    const a = await campaignWithCharacter("iso-a");
    const other = await player();
    await expect(getCampaignView(db, other.id, a.campaignId)).rejects.toMatchObject({ status: 404 });
    await expect(submitAction(db, offline, other.id, a.campaignId, { idempotencyKey: key(), action: { type: "first_aid" } })).rejects.toMatchObject({ status: 404 });
    const second = await createCampaign(db, a.playerId, { name: "Outra", systemId: "ordem-paranormal", editionId: "op-core", seed: "iso-a" });
    const c1 = await db.campaign.findUniqueOrThrow({ where: { id: a.campaignId } });
    const c2 = await db.campaign.findUniqueOrThrow({ where: { id: second } });
    expect((c2.fingerprint as { archetype: string }).archetype).not.toBe((c1.fingerprint as { archetype: string }).archetype);
    expect(c2.id).not.toBe(c1.id);
  });

  it("rejected actions do not change state and are recorded", async () => {
    const { playerId, campaignId } = await campaignWithCharacter();
    const r = await submitAction(db, offline, playerId, campaignId, { idempotencyKey: key(), action: { type: "move", to: { x: 0, y: 0 } } }, maxRng);
    expect(r.status).toBe("rejected");
    const v = await getCampaignView(db, playerId, campaignId);
    expect(v.campaign.version).toBe(0);
  });

  it("stale expected version is refused (concurrency)", async () => {
    const { playerId, campaignId } = await campaignWithCharacter();
    await expect(submitAction(db, offline, playerId, campaignId, { idempotencyKey: key(), expectedVersion: 7, action: { type: "first_aid" } })).rejects.toMatchObject({ status: 409 });
  });

  it("failure recovery: narration failure keeps the resolved action; retry narrates without re-running mechanics", async () => {
    const { playerId, campaignId } = await campaignWithCharacter();
    const broken: GmProvider = {
      id: "broken",
      interpret: async () => ({}),
      narrate: async () => {
        throw new Error("timeout");
      },
    };
    // An orchestrator whose fallback also fails, simulating a crash after commit.
    const failing = new GmOrchestrator(broken, { retries: 0 });
    (failing as unknown as { fallback: GmProvider }).fallback = broken;
    const view = await getCampaignView(db, playerId, campaignId);
    const clue = view.blueprint.clues.find((c) => c.id === "pista-rastro")!;
    const res = await play(failing, playerId, campaignId, { idempotencyKey: key(), action: { type: "interact", objectId: clue.objectId, verb: "search", powers: [] } });
    expect(res.status).toBe("resolved");
    expect(res.narration).toBeNull();
    const log = await db.actionLog.findUniqueOrThrow({ where: { id: res.actionId } });
    expect(log.status).toBe("RESOLVED");
    const rollsBefore = await db.rollLog.count({ where: { campaignId } });
    const text = await narrateAction(db, offline, playerId, campaignId, res.actionId!);
    expect(text).toBeTruthy();
    expect((await db.actionLog.findUniqueOrThrow({ where: { id: res.actionId } })).status).toBe("NARRATED");
    expect(await db.rollLog.count({ where: { campaignId } })).toBe(rollsBefore);
    expect((await getCampaignView(db, playerId, campaignId)).campaign.version).toBe(2);
    // Narrating again is a no-op.
    expect(await narrateAction(db, offline, playerId, campaignId, res.actionId!)).toBe(text);
    expect(await db.narrativeEntry.count({ where: { campaignId, role: "GM", actionId: res.actionId } })).toBe(1);
  });

  it("AI response validation: malformed interpretations fall back; illegal AI proposals are rejected by the engine", async () => {
    const { playerId, campaignId } = await campaignWithCharacter();
    const junk: GmProvider = { id: "junk", interpret: async () => ({ intent: "teleport" }), narrate: async () => ({ narration: 5 }) };
    const r1 = await submitAction(db, new GmOrchestrator(junk, { retries: 1 }), playerId, campaignId, { idempotencyKey: key(), text: "converso com a testemunha" }, maxRng);
    expect(["resolved", "rejected"]).toContain(r1.status);
    const liar: GmProvider = {
      id: "liar",
      interpret: async () => ({ intent: "interact", category: "physical", objectId: "exterior.nao-existe", areaId: null, verb: "open", skillId: null, npcId: null, approach: null, dt: null, reason: null, stakes: null, optionId: null, weaponId: null, special: null, clarification: null, rulesQuery: null }),
      narrate: async () => ({ narration: "ok", npcDialogue: [], outcome: "none", effects: [], gmNotes: "" }),
    };
    const before = (await getCampaignView(db, playerId, campaignId)).campaign.version;
    const r2 = await submitAction(db, new GmOrchestrator(liar), playerId, campaignId, { idempotencyKey: key(), text: "abro o portal secreto" }, maxRng);
    expect(r2.status).toBe("rejected");
    expect((await getCampaignView(db, playerId, campaignId)).campaign.version).toBe(before);
    const badDt: GmProvider = { ...liar, interpret: async () => ({ ...(await liar.interpret({} as never, "")) as object, intent: "skill_check", objectId: null, verb: null, skillId: "atletismo", dt: 13, stakes: "Cair do muro." }) };
    const r3 = await submitAction(db, new GmOrchestrator(badDt), playerId, campaignId, { idempotencyKey: key(), text: "pulo o muro" }, maxRng);
    expect(r3).toMatchObject({ status: "rejected", message: expect.stringContaining("tabela oficial") });
  });

  it("client view hides GM secrets and undiscovered clues", async () => {
    const { playerId, campaignId } = await campaignWithCharacter();
    const v = toClientView(await getCampaignView(db, playerId, campaignId));
    const s = JSON.stringify(v.blueprint);
    expect(s).not.toContain('"secret":');
    expect(s).not.toContain("secret-door");
    const raw = await getCampaignView(db, playerId, campaignId);
    const hidden = raw.blueprint.maps.flatMap((m) => m.objects.filter((o) => o.hidden).map((o) => o.id));
    expect(hidden.length).toBeGreaterThan(0);
    for (const id of hidden) {
      expect(s).not.toContain(`"${id}"`);
      expect(JSON.stringify(v.state.maps)).not.toContain(`"${id}"`);
    }
    expect(v.blueprint.clues.every((c) => c.title === "???")).toBe(true);
    expect(v.blueprint.endings).toEqual([]);
  });

  it("archive blocks actions; rename and delete work", async () => {
    const { playerId, campaignId } = await campaignWithCharacter();
    await updateCampaign(db, playerId, campaignId, { name: "Novo nome", archived: true });
    await expect(submitAction(db, offline, playerId, campaignId, { idempotencyKey: key(), action: { type: "first_aid" } })).rejects.toMatchObject({ status: 409 });
    expect((await listCampaigns(db, playerId))[0]).toMatchObject({ name: "Novo nome", status: "ARCHIVED" });
    await deleteCampaign(db, playerId, campaignId);
    expect(await listCampaigns(db, playerId)).toHaveLength(0);
    expect(await db.actionLog.count({ where: { campaignId } })).toBe(0);
  });
});
