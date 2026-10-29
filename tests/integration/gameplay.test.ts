import { afterAll, describe, expect, it } from "vitest";
import { generateAdventure } from "@/modules/adventures/generator";
import { GmOrchestrator } from "@/modules/gm/orchestrator";
import { OfflineGmProvider } from "@/modules/gm/offline";
import type { GmProvider } from "@/modules/gm/provider";
import { assertSides } from "@/modules/rules/core/random";
import { combatentePolicial } from "@/modules/rules/systems/ordem-paranormal/__tests__/fixtures";
import { areaAt, areaKey } from "@/modules/world/areas";
import { cancelPending, createCampaign, getCampaignView, rollPending, saveCharacter, ServiceError, submitAction, type SubmitInput, type SubmitResult } from "@/server/campaigns";
import { createDb } from "@/server/db";

const url = process.env.TEST_DATABASE_URL;
const db = url ? createDb(url) : (null as never);
const maxRng = { die: (s: number) => (assertSides(s), s) };
const minRng = { die: (s: number) => (assertSides(s), 1) };
const offlineProvider = new OfflineGmProvider();
const offline = new GmOrchestrator(offlineProvider, { retries: 0 });
const key = () => `k_${crypto.randomUUID().replace(/-/g, "")}`;

async function play(gm: GmOrchestrator, playerId: string, campaignId: string, input: SubmitInput, rng = maxRng): Promise<SubmitResult> {
  let res = await submitAction(db, gm, playerId, campaignId, input, rng);
  while (res.status === "roll") res = await rollPending(db, gm, playerId, campaignId, { actionId: res.actionId!, index: res.request!.index }, rng);
  return res;
}

async function campaign(seed = crypto.randomUUID()) {
  const p = await db.player.create({ data: {} });
  const id = await createCampaign(db, p.id, { name: "Teste", systemId: "ordem-paranormal", editionId: "op-core", seed });
  await saveCharacter(db, p.id, id, combatentePolicial);
  return { playerId: p.id, campaignId: id };
}

async function searchClueInput(playerId: string, campaignId: string): Promise<SubmitInput> {
  const view = await getCampaignView(db, playerId, campaignId);
  const clue = view.blueprint.clues.find((c) => c.id === "pista-rastro")!;
  return { idempotencyKey: key(), action: { type: "interact", objectId: clue.objectId, verb: "search", powers: [] } };
}

describe.skipIf(!url)("gameplay loop (PostgreSQL)", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("no automatic rolls: a test waits for the click, with stakes, and nothing is rolled or changed before it", async () => {
    const { playerId, campaignId } = await campaign();
    const before = await getCampaignView(db, playerId, campaignId);
    const res = await submitAction(db, offline, playerId, campaignId, await searchClueInput(playerId, campaignId), maxRng);
    expect(res.status).toBe("roll");
    expect(res.request).toMatchObject({ index: 0, kind: "test", targetLabel: "DT" });
    expect(res.request!.stakes.length).toBeGreaterThan(10);
    expect(await db.rollLog.count({ where: { campaignId } })).toBe(0);
    const during = await getCampaignView(db, playerId, campaignId);
    expect(during.state.clues).toEqual(before.state.clues);
    expect(during.character!.state).toEqual(before.character!.state);
    expect(during.state.pending?.request.index).toBe(0);
    expect(during.narrative.at(-1)).toMatchObject({ role: "SYSTEM", meta: { kind: "roll_request" } });

    // Another action is refused until the roll is made or abandoned.
    await expect(submitAction(db, offline, playerId, campaignId, { idempotencyKey: key(), action: { type: "observe" } }, maxRng)).rejects.toMatchObject({ status: 409 });

    const rolled = await rollPending(db, offline, playerId, campaignId, { actionId: res.actionId!, index: 0 }, maxRng);
    expect(rolled.status).toBe("resolved");
    expect(rolled.rolled![0].dice.every((d) => d.value === 20)).toBe(true);
    expect(await db.rollLog.count({ where: { campaignId } })).toBe(1);
  });

  it("a double click on the dice rolls once", async () => {
    const { playerId, campaignId } = await campaign();
    const res = await submitAction(db, offline, playerId, campaignId, await searchClueInput(playerId, campaignId), maxRng);
    const [a, b] = await Promise.allSettled([
      rollPending(db, offline, playerId, campaignId, { actionId: res.actionId!, index: 0 }, maxRng),
      rollPending(db, offline, playerId, campaignId, { actionId: res.actionId!, index: 0 }, minRng),
    ]);
    const ok = [a, b].filter((x) => x.status === "fulfilled").map((x) => (x as PromiseFulfilledResult<SubmitResult>).value);
    expect(ok.filter((x) => x.status === "resolved")).toHaveLength(1);
    const again = await rollPending(db, offline, playerId, campaignId, { actionId: res.actionId!, index: 0 }, minRng);
    expect(again.status).toBe("duplicate");
    expect(await db.rollLog.count({ where: { campaignId } })).toBe(1);
  });

  it("backing out before rolling leaves the world untouched", async () => {
    const { playerId, campaignId } = await campaign();
    const before = await getCampaignView(db, playerId, campaignId);
    const res = await submitAction(db, offline, playerId, campaignId, await searchClueInput(playerId, campaignId), maxRng);
    await cancelPending(db, playerId, campaignId, res.actionId!);
    const after = await getCampaignView(db, playerId, campaignId);
    expect(after.state.pending).toBeNull();
    expect(after.state.clues).toEqual(before.state.clues);
    expect(after.state.urgency).toBe(before.state.urgency);
    expect(await db.rollLog.count({ where: { campaignId } })).toBe(0);
    expect((await db.actionLog.findUniqueOrThrow({ where: { id: res.actionId } })).status).toBe("REJECTED");
    expect((await play(offline, playerId, campaignId, { idempotencyKey: key(), action: { type: "observe" } })).status).toBe("resolved");
  });

  it("the same sentence sent twice in a row is one action (double submit)", async () => {
    const { playerId, campaignId } = await campaign();
    const first = await submitAction(db, offline, playerId, campaignId, { idempotencyKey: key(), text: "Olho ao redor." }, maxRng);
    const second = await submitAction(db, offline, playerId, campaignId, { idempotencyKey: key(), text: "olho ao redor" }, maxRng);
    expect(first.status).toBe("resolved");
    expect(second.status).toBe("duplicate");
    expect(await db.actionLog.count({ where: { campaignId } })).toBe(1);
    expect(await db.narrativeEntry.count({ where: { campaignId, role: "GM", actionId: first.actionId } })).toBe(1);
  });

  it("concurrent submits commit only one action", async () => {
    const { playerId, campaignId } = await campaign();
    const v = (await getCampaignView(db, playerId, campaignId)).campaign.version;
    const results = await Promise.allSettled(
      ["Olho ao redor.", "Observo a rua com atenção."].map((text) => submitAction(db, offline, playerId, campaignId, { idempotencyKey: key(), expectedVersion: v, text }, maxRng)),
    );
    const resolved = results.filter((r) => r.status === "fulfilled" && r.value.status === "resolved");
    expect(resolved).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(ServiceError);
    expect((await getCampaignView(db, playerId, campaignId)).campaign.version).toBe(v + 1);
  });

  it("the engine, not the narrator, decides: max dice find the clue, min dice do not", async () => {
    const seed = crypto.randomUUID();
    const hit = await campaign(seed);
    const miss = await campaign(seed);
    await play(offline, hit.playerId, hit.campaignId, await searchClueInput(hit.playerId, hit.campaignId), maxRng);
    const failed = await play(offline, miss.playerId, miss.campaignId, await searchClueInput(miss.playerId, miss.campaignId), minRng);
    const hv = await getCampaignView(db, hit.playerId, hit.campaignId);
    const mv = await getCampaignView(db, miss.playerId, miss.campaignId);
    expect(hv.state.clues["pista-rastro"].discovered).toBe(true);
    expect(mv.state.clues["pista-rastro"].discovered).toBe(false);
    expect(failed.outcome?.verdict).toBe("failure");
    const clue = mv.blueprint.clues.find((c) => c.id === "pista-rastro")!;
    expect(failed.narration).not.toContain(clue.description);
    // The hit is in the journal as an established fact; the miss left no trace there.
    expect(hv.state.journal.some((j) => j.kind === "fact" && j.text.includes(clue.title))).toBe(true);
    expect(mv.state.journal.some((j) => j.text.includes(clue.title))).toBe(false);
  });

  it("narration that contradicts the dice is replaced by the safe narrator", async () => {
    const { playerId, campaignId } = await campaign();
    const boastful: GmProvider = {
      id: "boastful",
      interpret: (i, t) => offlineProvider.interpret(i, t),
      narrate: async () => ({ narration: "Você encontra exatamente o que procurava, sem esforço algum.", npcDialogue: [], outcome: "success", effects: [], gmNotes: "" }),
    };
    const res = await play(new GmOrchestrator(boastful, { retries: 0 }), playerId, campaignId, await searchClueInput(playerId, campaignId), minRng);
    expect(res.status).toBe("resolved");
    expect(res.narration).not.toContain("exatamente o que procurava");
    const log = await db.actionLog.findUniqueOrThrow({ where: { id: res.actionId } });
    expect(log.result).toMatchObject({ provider: "offline", degraded: true });
  });

  it("narration that reveals an undiscovered clue is rejected", async () => {
    const { playerId, campaignId } = await campaign();
    const view = await getCampaignView(db, playerId, campaignId);
    const secret = view.blueprint.clues.find((c) => c.id !== "pista-rastro")!;
    const leaky: GmProvider = {
      id: "leaky",
      interpret: (i, t) => offlineProvider.interpret(i, t),
      narrate: async () => ({ narration: `Do nada você entende tudo: ${secret.description}`, npcDialogue: [], outcome: "none", effects: [], gmNotes: "" }),
    };
    const res = await play(new GmOrchestrator(leaky, { retries: 0 }), playerId, campaignId, { idempotencyKey: key(), text: "Olho ao redor." });
    expect(res.narration).not.toContain(secret.description);
    const log = await db.actionLog.findUniqueOrThrow({ where: { id: res.actionId } });
    expect(log.result).toMatchObject({ provider: "offline", guardIssues: [expect.stringContaining("pista oculta")] });
  });

  it("free-form text: looking and asking questions never roll; unclear intent gets a question back", async () => {
    const { playerId, campaignId } = await campaign();
    const view = await getCampaignView(db, playerId, campaignId);
    const look = await submitAction(db, offline, playerId, campaignId, { idempotencyKey: key(), text: "Olho ao redor." }, maxRng);
    expect(look.status).toBe("resolved");
    const npc = view.blueprint.npcs.find((n) => n.mapId === view.state.currentMapId)!;
    const ask = await submitAction(db, offline, playerId, campaignId, { idempotencyKey: key(), text: `Pergunto a ${npc.name.split(" ")[0]} se viu alguém entrar ali hoje.` }, maxRng);
    expect(ask.status).toBe("resolved");
    expect(await db.rollLog.count({ where: { campaignId } })).toBe(0);
    const v = (await getCampaignView(db, playerId, campaignId)).campaign.version;
    const unclear = await submitAction(db, offline, playerId, campaignId, { idempotencyKey: key(), text: "Vou para o porão." }, maxRng);
    expect(unclear.status).toBe("clarify");
    expect((await getCampaignView(db, playerId, campaignId)).campaign.version).toBe(v);
  });

  it("NPC knowledge: what someone tells you is recorded under their name and survives reloads", async () => {
    const { playerId, campaignId } = await campaign();
    const view = await getCampaignView(db, playerId, campaignId);
    const npc = view.blueprint.npcs.find((n) => n.mapId === view.state.currentMapId)!;
    await play(offline, playerId, campaignId, { idempotencyKey: key(), action: { type: "talk", npcId: npc.id, approach: "conversar", powers: [] } });
    const after = await getCampaignView(db, playerId, campaignId);
    expect(after.state.npcs[npc.id].talked).toBe(true);
    const fromNpc = after.state.journal.filter((j) => j.npcId === npc.id);
    expect(fromNpc.length).toBeGreaterThan(0);
    // What an NPC says is a statement unless the engine confirmed it.
    for (const j of fromNpc) expect(["statement", "fact"]).toContain(j.kind);
  });

  it("scene transitions: going to a room walks through doors, opens them and remembers the visit", async () => {
    let seed = "";
    for (let i = 0; i < 300 && !seed; i++) {
      const bp = generateAdventure(`room-${i}`).blueprint;
      const exit = bp.maps[0].objects.find((o) => o.kind === "exit")!;
      if (exit.initialState !== "locked" && bp.maps[1].areas.some((a) => a.id === "biblioteca" && !a.hidden)) seed = `room-${i}`;
    }
    const { playerId, campaignId } = await campaign(seed);
    const start = await getCampaignView(db, playerId, campaignId);
    const interior = start.blueprint.maps[1];
    expect(start.blueprint.maps[0].objects.find((o) => o.kind === "exit")!.initialState).not.toBe("locked");
    const res = await play(offline, playerId, campaignId, { idempotencyKey: key(), text: "Vou para a biblioteca." });
    expect(res.status).toBe("resolved");
    const after = await getCampaignView(db, playerId, campaignId);
    expect(after.state.currentMapId).toBe(interior.id);
    expect(areaAt(interior, after.state.maps[interior.id].player)?.id).toBe("biblioteca");
    expect(after.state.areasVisited).toContain(areaKey(interior.id, "biblioteca"));
    const opened = Object.entries(after.state.maps[interior.id].objects).filter(([id, o]) => interior.objects.find((x) => x.id === id)?.kind === "door" && o.state === "open");
    expect(opened.length).toBeGreaterThan(0);
    expect(res.narration).toBeTruthy();
    // Going back to the same room says so instead of describing it again.
    const again = await play(offline, playerId, campaignId, { idempotencyKey: key(), action: { type: "go", areaId: "biblioteca" } });
    expect(again.narration).toMatch(/já está/i);
  });
});
