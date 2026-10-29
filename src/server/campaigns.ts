import "server-only";
import { generateNovelAdventure } from "@/modules/adventures/generator";
import { AdventureBlueprintSchema, FingerprintSchema, type AdventureBlueprint } from "@/modules/adventures/schema";
import { PlayerActionSchema, type PlayerAction } from "@/modules/campaign/actions";
import type { DiceMode, PendingRoll, RollRequest } from "@/modules/campaign/dice";
import { runAction, type ActionOutcome, type RunResult } from "@/modules/campaign/engine";
import { CampaignStateSchema, conditionContextOf, initialCampaignState, type CampaignState } from "@/modules/campaign/state";
import { evaluate } from "@/modules/adventures/conditions";
import type { GmContextInput } from "@/modules/gm/context";
import type { GmOrchestrator } from "@/modules/gm/orchestrator";
import { getEdition, getSystem } from "@/modules/rules/registry";
import { SKILL_POWERS } from "@/modules/rules/systems/ordem-paranormal/tests";
import { cryptoRandom } from "@/modules/rules/core/crypto-random";
import { isPresent, playerView } from "@/modules/world/grid";
import type { RandomSource } from "@/modules/rules/core/random";
import type { RollRecord } from "@/modules/rules/core/dice";
import { normalize } from "@/modules/knowledge/text";
import {
  deriveSheet,
  initialState,
  OpCharacterBuildSchema,
  OpCharacterStateSchema,
  validateBuild,
  type OpSheet,
} from "@/modules/rules/systems/ordem-paranormal/character";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";

export class ServiceError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

const json = (v: unknown) => v as Prisma.InputJsonValue;

async function ownedCampaign(db: PrismaClient, playerId: string, campaignId: string) {
  const c = await db.campaign.findFirst({ where: { id: campaignId, ownerId: playerId }, include: { character: true } });
  if (!c) throw new ServiceError("Campanha não encontrada.", 404);
  return c;
}

export async function listCampaigns(db: PrismaClient, playerId: string) {
  const rows = await db.campaign.findMany({ where: { ownerId: playerId }, include: { character: true }, orderBy: { updatedAt: "desc" } });
  return rows.map((c) => {
    const bp = c.blueprint as unknown as AdventureBlueprint;
    const st = c.state as unknown as CampaignState;
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      systemId: c.systemId,
      editionId: c.editionId,
      title: bp.title,
      premise: bp.premise,
      city: bp.setting.city,
      characterName: c.character?.name ?? null,
      ending: st.ending?.title ?? null,
      updatedAt: c.updatedAt.toISOString(),
      createdAt: c.createdAt.toISOString(),
    };
  });
}

export async function createCampaign(db: PrismaClient, playerId: string, input: { name: string; systemId: string; editionId: string; seed?: string }) {
  const system = getSystem(input.systemId);
  if (!system || system.availability !== "available") throw new ServiceError("Sistema de regras indisponível.", 400);
  const edition = getEdition(input.systemId, input.editionId);
  if (!edition?.available) throw new ServiceError("Edição de regras indisponível.", 400);
  const previous = await db.campaign.findMany({ where: { ownerId: playerId }, select: { fingerprint: true } });
  const fingerprints = previous.map((p) => FingerprintSchema.safeParse(p.fingerprint)).filter((r) => r.success).map((r) => r.data!);
  const seed = input.seed?.trim() || crypto.randomUUID();
  const { blueprint, fingerprint, similarity } = generateNovelAdventure(seed, fingerprints);
  const state = initialCampaignState(blueprint);
  const campaign = await db.campaign.create({
    data: {
      ownerId: playerId,
      name: input.name.trim().slice(0, 80) || blueprint.title,
      systemId: input.systemId,
      editionId: input.editionId,
      seed,
      blueprint: json(blueprint),
      fingerprint: json({ ...fingerprint, similarity }),
      state: json(state),
      narrative: {
        create: [{ role: "SYSTEM", content: `${blueprint.title}. ${blueprint.premise}` }, { role: "GM", content: blueprint.hook }],
      },
    },
  });
  return campaign.id;
}

export async function updateCampaign(db: PrismaClient, playerId: string, campaignId: string, patch: { name?: string; archived?: boolean }) {
  const c = await ownedCampaign(db, playerId, campaignId);
  const st = c.state as unknown as CampaignState;
  await db.campaign.update({
    where: { id: c.id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 80) || c.name } : {}),
      ...(patch.archived !== undefined ? { status: patch.archived ? "ARCHIVED" : st.mode === "ended" ? "COMPLETED" : "ACTIVE" } : {}),
    },
  });
}

export async function deleteCampaign(db: PrismaClient, playerId: string, campaignId: string) {
  const c = await ownedCampaign(db, playerId, campaignId);
  await db.campaign.delete({ where: { id: c.id } });
}

export async function saveCharacter(db: PrismaClient, playerId: string, campaignId: string, input: unknown) {
  const c = await ownedCampaign(db, playerId, campaignId);
  const result = validateBuild(input);
  if (!result.ok) throw new ServiceError("Personagem inválido.", 422, result.issues);
  const st = c.state as unknown as CampaignState;
  if (c.character && st.actionCount > 0) {
    // After play starts, only identity fields may change.
    const prev = OpCharacterBuildSchema.parse(c.character.build);
    const build = { ...prev, name: result.build.name, concept: result.build.concept };
    await db.character.update({ where: { id: c.character.id }, data: { name: build.name, build: json(build) } });
    return { id: c.character.id, mechanicsLocked: true };
  }
  const sheet = deriveSheet(result.build);
  const charState = initialState(result.build, sheet);
  const data = { name: result.build.name, build: json(result.build), sheet: json(sheet), state: json(charState), systemId: c.systemId, editionId: c.editionId };
  const saved = c.character
    ? await db.character.update({ where: { id: c.character.id }, data })
    : await db.character.create({ data: { ...data, campaignId: c.id } });
  return { id: saved.id, mechanicsLocked: false };
}

export async function getCampaignView(db: PrismaClient, playerId: string, campaignId: string) {
  const c = await ownedCampaign(db, playerId, campaignId);
  const [narrative, rolls, actions, memories] = await Promise.all([
    // The latest 400 entries (newest first, reversed below); entries written in one transaction share a timestamp, so the id breaks ties.
    db.narrativeEntry.findMany({ where: { campaignId: c.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 400 }),
    db.rollLog.findMany({ where: { campaignId: c.id }, orderBy: { createdAt: "desc" }, take: 60 }),
    db.actionLog.findMany({ where: { campaignId: c.id }, orderBy: { sequence: "desc" }, take: 40 }),
    db.campaignMemory.findMany({ where: { campaignId: c.id }, orderBy: { createdAt: "asc" } }),
  ]);
  return {
    campaign: { id: c.id, name: c.name, status: c.status, version: c.version, seed: c.seed, systemId: c.systemId, editionId: c.editionId },
    blueprint: AdventureBlueprintSchema.parse(c.blueprint),
    state: CampaignStateSchema.parse(c.state),
    character: c.character
      ? { id: c.character.id, name: c.character.name, build: OpCharacterBuildSchema.parse(c.character.build), sheet: c.character.sheet as unknown as OpSheet, state: OpCharacterStateSchema.parse(c.character.state) }
      : null,
    narrative: narrative.reverse().map((n) => ({ id: n.id, actionId: n.actionId, role: n.role, content: n.content, meta: n.meta, createdAt: n.createdAt.toISOString() })),
    rolls: rolls.map((r) => ({ id: r.id, actionId: r.actionId, label: r.label, total: r.total, detail: r.detail, createdAt: r.createdAt.toISOString() })),
    actions: actions.map((a) => ({ id: a.id, sequence: a.sequence, kind: a.kind, status: a.status, narration: a.narration, result: a.result, createdAt: a.createdAt.toISOString() })),
    memories: memories.map((m) => m.content),
  };
}

export type CampaignView = Awaited<ReturnType<typeof getCampaignView>>;

/** Strips GM-only secrets before sending a view to the browser. */
export function toClientView(view: CampaignView) {
  const bp = view.blueprint;
  const st = view.state;
  const encountered = (threatId: string) => st.mode === "ended" || st.encounter?.threatId === threatId || bp.encounters.some((e) => e.threatId === threatId && e.id in st.encountersResolved);
  const threatObjects = new Map(bp.encounters.map((e) => [e.objectId, e.threatId]));
  return {
    ...view,
    state: {
      ...st,
      // Dice already rolled are shown in `rolls`; the raw tapes stay on the server.
      pending: st.pending ? { ...st.pending, tape: { player: [], world: [] }, action: {} } : null,
      maps: Object.fromEntries(
        bp.maps.map((m) => {
          const ms = st.maps[m.id];
          return [m.id, { ...ms, objects: Object.fromEntries(Object.entries(ms.objects).filter(([id]) => isPresent(m, ms, id))) }];
        }),
      ),
    },
    blueprint: {
      ...bp,
      maps: bp.maps.map((m) => {
        const pv = playerView(m, st.maps[m.id]);
        // Until met, a creature is only "something" in the dark.
        return { ...pv, objects: pv.objects.map((o) => (threatObjects.has(o.id) && !encountered(threatObjects.get(o.id)!) ? { ...o, name: "Presença desconhecida", description: "Algo se move na escuridão." } : o)) };
      }),
      antagonist: st.mode === "ended" ? bp.antagonist : { name: "???", nature: "", motive: "" },
      npcs: bp.npcs.map((n) => ({ id: n.id, name: n.name, role: n.role, mapId: n.mapId, objectId: n.objectId })),
      clues: bp.clues.map((c) => ({ id: c.id, title: st.clues[c.id].discovered ? c.title : "???", description: st.clues[c.id].discovered ? c.description : "", importance: c.importance, mapId: c.mapId, objectId: c.objectId, discoveredBy: st.clues[c.id].discoveredBy })),
      threats: bp.threats.map((t) => (encountered(t.id) ? { id: t.id, name: t.name, description: t.description, pv: t.pv, element: t.element } : { id: t.id, name: "???", description: "", pv: 0, element: t.element })),
      endings: [],
      derivedFlags: [],
      locks: [],
      hypotheses: bp.hypotheses.map((h) => ({ ...h, status: h.supportedBy.length && h.supportedBy.every((id) => st.clues[id].discovered) ? "supported" : "unconfirmed" })),
      items: bp.items.map((i) => ({ id: i.id, name: i.name, description: i.description })),
    },
    actions: view.actions.map((a) => ({ ...a, result: stripGmNotes(a.result) })),
    decisionAvailable: st.mode === "exploration" && !(bp.decision.id in st.decisions) && evaluate(bp.decision.availableWhen, conditionContextOf(st)),
  };
}

/** GM planning notes and the engine's hints about alternatives never reach the player. */
function stripGmNotes(result: unknown) {
  if (result && typeof result === "object") {
    const { gmNotes: _n, suggestions: _s, narrationSuggestions: _ns, tape: _t, ...rest } = result as Record<string, unknown>;
    void _n;
    void _s;
    void _ns;
    void _t;
    return rest;
  }
  return result;
}

export type SubmitInput = { idempotencyKey: string; expectedVersion?: number; targetId?: string | null } & ({ action: PlayerAction } | { text: string; powers?: string[] });

type Outcome = Pick<ActionOutcome, "facts" | "rolls" | "events" | "mapEvents" | "verdict">;

export interface SubmitResult {
  status: "resolved" | "rejected" | "clarify" | "rules" | "duplicate" | "roll";
  actionId?: string;
  message?: string;
  outcome?: Outcome;
  narration?: string | null;
  /** Waiting for the player's click (status "roll"). */
  request?: RollRequest;
  /** Rolls made by this call, the player's own roll first. */
  rolled?: RollRecord[];
  version: number;
}

function gmInput(view: CampaignView, targetId?: string | null): GmContextInput {
  return {
    blueprint: view.blueprint,
    state: view.state,
    sheet: view.character!.sheet,
    character: { ...view.character!.state, name: view.character!.name, concept: view.character!.build.concept },
    history: view.narrative.slice(-12).map((n) => ({ role: n.role, content: n.content })),
    targetId: targetId ?? null,
  };
}

function engineContext(view: CampaignView, dice: DiceMode, rng: RandomSource) {
  const { pending: _p, ...rest } = view.state;
  void _p;
  return {
    blueprint: view.blueprint,
    state: { ...rest, pending: null },
    character: { build: view.character!.build, sheet: view.character!.sheet, state: view.character!.state },
    rng,
    dice,
  };
}

/** The same sentence sent twice in quick succession is one action (double click, Enter + button, retry). */
const RESUBMIT_WINDOW_MS = 20_000;

/**
 * The action pipeline: idempotency → (AI interpretation) → deterministic
 * resolution → either a pending roll (the player must click) or an atomic
 * commit → (AI narration). A completed action is never lost or re-executed if
 * narration fails, and the AI never touches persistence.
 */
export async function submitAction(db: PrismaClient, gm: GmOrchestrator, playerId: string, campaignId: string, input: SubmitInput, rng: RandomSource = cryptoRandom): Promise<SubmitResult> {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(input.idempotencyKey)) throw new ServiceError("Chave de idempotência inválida.", 400);
  const existing = await db.actionLog.findFirst({ where: { campaignId, idempotencyKey: input.idempotencyKey, campaign: { ownerId: playerId } } });
  if (existing) return duplicateResult(db, existing);

  const view = await getCampaignView(db, playerId, campaignId);
  if (!view.character) throw new ServiceError("Crie um personagem antes de jogar.", 409);
  if (view.campaign.status === "ARCHIVED") throw new ServiceError("Campanha arquivada. Desarquive para continuar.", 409);
  if ("text" in input) {
    const recent = await db.actionLog.findFirst({ where: { campaignId: view.campaign.id }, orderBy: { createdAt: "desc" } });
    const recentText = (recent?.input as { text?: string | null } | undefined)?.text;
    if (recent && recentText && normalize(recentText) === normalize(input.text) && Date.now() - recent.createdAt.getTime() < RESUBMIT_WINDOW_MS) {
      return duplicateResult(db, recent);
    }
  }
  if (input.expectedVersion !== undefined && input.expectedVersion !== view.campaign.version) {
    throw new ServiceError("O estado da campanha mudou. Recarregue para continuar.", 409);
  }
  if (view.state.pending) throw new ServiceError("Há uma rolagem pendente. Role os dados ou desista da ação antes de fazer outra coisa.", 409);

  let action: PlayerAction;
  let playerText: string | undefined;
  if ("text" in input) {
    playerText = input.text.trim().slice(0, 2000);
    if (!playerText) throw new ServiceError("Escreva o que seu personagem faz.", 400);
    const interp = await gm.interpret(gmInput(view, input.targetId), playerText);
    if (interp.kind !== "action") {
      const message = interp.kind === "clarify" ? interp.question : interp.answer;
      await recordNonAction(db, view, input.idempotencyKey, playerText, interp.kind, message);
      return { status: interp.kind, message, version: view.campaign.version };
    }
    action = interp.action;
    // Powers the player armed in the UI ride along with tests; the engine checks they apply and that PE suffices.
    const powers = (input.powers ?? []).filter((p): p is (typeof SKILL_POWERS)[number] => (SKILL_POWERS as readonly string[]).includes(p));
    if (powers.length && "powers" in action) action = { ...action, powers } as PlayerAction;
  } else {
    const parsed = PlayerActionSchema.safeParse(input.action);
    if (!parsed.success) throw new ServiceError("Ação malformada.", 400, parsed.error.issues);
    action = parsed.data;
  }

  const run = runAction(engineContext(view, { kind: "manual", tape: { player: [], world: [] }, live: 0, source: rng }, rng), action);
  if (run.ok === false) {
    await recordNonAction(db, view, input.idempotencyKey, playerText ?? describeAction(action), "rejected", run.reason, action);
    return { status: "rejected", message: run.reason, version: view.campaign.version };
  }
  if (run.ok === "roll") return createPending(db, view, input.idempotencyKey, action, playerText ?? null, run);

  const actionId = await commit(db, view, { key: input.idempotencyKey, action, text: playerText ?? null, logId: null }, run);
  const narration = await narrateAction(db, gm, playerId, campaignId, actionId);
  return { status: "resolved", actionId, outcome: pick(run), narration, version: view.campaign.version + 1 };
}

function pick(o: ActionOutcome): Outcome {
  return { facts: o.facts, rolls: o.rolls, events: o.events, mapEvents: o.mapEvents, verdict: o.verdict };
}

type RollRun = Extract<RunResult, { ok: "roll" }>;

async function createPending(db: PrismaClient, view: CampaignView, key: string, action: PlayerAction, text: string | null, run: RollRun): Promise<SubmitResult> {
  const nextVersion = view.campaign.version + 1;
  try {
    const actionId = await db.$transaction(async (tx) => {
      const minSeq = await tx.actionLog.findFirst({ where: { campaignId: view.campaign.id, sequence: { lt: 0 } }, orderBy: { sequence: "asc" }, select: { sequence: true } });
      const log = await tx.actionLog.create({
        data: { campaignId: view.campaign.id, idempotencyKey: key, sequence: (minSeq?.sequence ?? 0) - 1, kind: action.type, input: json({ action, text }), result: json({}), status: "PENDING" },
      });
      const pending: PendingRoll = { actionId: log.id, action: action as Record<string, unknown>, text, tape: run.tape, request: run.request, rolls: run.rolls, cancellable: run.playerRolls === 0 };
      const updated = await tx.campaign.updateMany({ where: { id: view.campaign.id, version: view.campaign.version }, data: { state: json({ ...view.state, pending }), version: nextVersion } });
      if (updated.count !== 1) throw new ServiceError("Outra ação foi registrada ao mesmo tempo. Recarregue.", 409);
      await tx.narrativeEntry.create({ data: { campaignId: view.campaign.id, actionId: log.id, role: "PLAYER", content: text ?? describeAction(action) } });
      await tx.narrativeEntry.create({ data: { campaignId: view.campaign.id, actionId: log.id, role: "SYSTEM", content: run.request.stakes, meta: json({ kind: "roll_request", label: run.request.label }) } });
      return log.id;
    });
    return { status: "roll", actionId, request: run.request, rolled: run.rolls, version: nextVersion };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const dup = await db.actionLog.findFirst({ where: { campaignId: view.campaign.id, idempotencyKey: key } });
      if (dup) return duplicateResult(db, dup);
    }
    throw e;
  }
}

/** Commits a fully resolved action atomically (state, character, log, rolls, journal lines). */
async function commit(db: PrismaClient, view: CampaignView, a: { key: string; action: PlayerAction; text: string | null; logId: string | null }, out: ActionOutcome): Promise<string> {
  const nextVersion = view.campaign.version + 1;
  const state = { ...out.state, pending: null };
  try {
    return await db.$transaction(async (tx) => {
      const updated = await tx.campaign.updateMany({
        where: { id: view.campaign.id, version: view.campaign.version },
        data: { state: json(state), version: nextVersion, status: state.mode === "ended" ? "COMPLETED" : undefined },
      });
      if (updated.count !== 1) throw new ServiceError("Outra ação foi registrada ao mesmo tempo. Recarregue.", 409);
      await tx.character.update({ where: { id: view.character!.id }, data: { state: json(out.characterState) } });
      const result = json({ facts: out.facts, beats: out.beats, events: out.events, mapEvents: out.mapEvents, suggestions: out.suggestions, rolls: out.rolls, verdict: out.verdict });
      const log = a.logId
        ? await tx.actionLog.update({ where: { id: a.logId }, data: { sequence: nextVersion, status: "RESOLVED", result } })
        : await tx.actionLog.create({ data: { campaignId: view.campaign.id, idempotencyKey: a.key, sequence: nextVersion, kind: a.action.type, input: json({ action: a.action, text: a.text }), result, status: "RESOLVED" } });
      if (out.rolls.length) {
        await tx.rollLog.createMany({ data: out.rolls.map((r) => ({ campaignId: view.campaign.id, actionId: log.id, label: r.label, detail: json(r), total: r.total })) });
      }
      // Clicks on the scene (moving, looking) are not things the player "said".
      if (!a.logId && (a.text || !["move", "go", "observe"].includes(a.action.type))) {
        await tx.narrativeEntry.create({ data: { campaignId: view.campaign.id, actionId: log.id, role: "PLAYER", content: a.text ?? describeAction(a.action) } });
      }
      return log.id;
    });
  } catch (e) {
    if (!a.logId && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const dup = await db.actionLog.findFirst({ where: { campaignId: view.campaign.id, idempotencyKey: a.key } });
      if (dup) return dup.id;
    }
    throw e;
  }
}

/**
 * Rolls the player's pending die and resumes the action. Idempotent: a repeated
 * click for a roll that was already made returns that roll instead of a new one.
 */
export async function rollPending(db: PrismaClient, gm: GmOrchestrator, playerId: string, campaignId: string, input: { actionId: string; index: number }, rng: RandomSource = cryptoRandom): Promise<SubmitResult> {
  const view = await getCampaignView(db, playerId, campaignId);
  const pending = view.state.pending;
  if (!pending || pending.actionId !== input.actionId) {
    const log = await db.actionLog.findFirst({ where: { id: input.actionId, campaignId: view.campaign.id } });
    if (log && log.status !== "PENDING") return duplicateResult(db, log);
    throw new ServiceError("Não há rolagem pendente para esta ação.", 409);
  }
  if (input.index !== pending.request.index) {
    // A double click on a roll that already happened: show the same dice again.
    if (input.index < pending.request.index) return { status: "duplicate", actionId: pending.actionId, request: pending.request, rolled: pending.rolls, version: view.campaign.version };
    throw new ServiceError("Rolagem fora de ordem.", 409);
  }
  const action = PlayerActionSchema.parse(pending.action);
  const run = runAction(engineContext(view, { kind: "manual", tape: pending.tape, live: 1, source: rng }, rng), action);
  const rolled = run.ok === false ? [] : run.rolls.slice(pending.rolls.length);
  const nextVersion = view.campaign.version + 1;

  if (run.ok === false) {
    // The world did not change between click and replay, so this means the action became illegal; drop it without effect.
    await db.$transaction(async (tx) => {
      const updated = await tx.campaign.updateMany({ where: { id: view.campaign.id, version: view.campaign.version }, data: { state: json({ ...view.state, pending: null }), version: nextVersion } });
      if (updated.count !== 1) throw new ServiceError("Outra ação foi registrada ao mesmo tempo. Recarregue.", 409);
      await tx.actionLog.update({ where: { id: pending.actionId }, data: { status: "REJECTED", result: json({ message: run.reason }), narration: run.reason } });
      await tx.narrativeEntry.create({ data: { campaignId: view.campaign.id, actionId: pending.actionId, role: "SYSTEM", content: run.reason, meta: json({ kind: "rejected" }) } });
    });
    return { status: "rejected", actionId: pending.actionId, message: run.reason, version: nextVersion };
  }
  if (run.ok === "roll") {
    const next: PendingRoll = { ...pending, tape: run.tape, request: run.request, rolls: run.rolls, cancellable: false };
    await db.$transaction(async (tx) => {
      const updated = await tx.campaign.updateMany({ where: { id: view.campaign.id, version: view.campaign.version }, data: { state: json({ ...view.state, pending: next }), version: nextVersion } });
      if (updated.count !== 1) throw new ServiceError("Outra ação foi registrada ao mesmo tempo. Recarregue.", 409);
      await tx.narrativeEntry.create({ data: { campaignId: view.campaign.id, actionId: pending.actionId, role: "SYSTEM", content: run.request.stakes, meta: json({ kind: "roll_request", label: run.request.label }) } });
    });
    return { status: "roll", actionId: pending.actionId, request: run.request, rolled, version: nextVersion };
  }
  const actionId = await commit(db, view, { key: "", action, text: pending.text, logId: pending.actionId }, run);
  const narration = await narrateAction(db, gm, playerId, campaignId, actionId);
  return { status: "resolved", actionId, outcome: pick(run), rolled, narration, version: nextVersion };
}

/** Backs out of a pending action before any of its dice were rolled. Nothing changes in the world. */
export async function cancelPending(db: PrismaClient, playerId: string, campaignId: string, actionId: string) {
  const view = await getCampaignView(db, playerId, campaignId);
  const pending = view.state.pending;
  if (!pending || pending.actionId !== actionId) throw new ServiceError("Não há rolagem pendente para esta ação.", 409);
  if (!pending.cancellable) throw new ServiceError("Os dados desta ação já começaram a rolar; termine a ação.", 409);
  await db.$transaction(async (tx) => {
    const updated = await tx.campaign.updateMany({ where: { id: view.campaign.id, version: view.campaign.version }, data: { state: json({ ...view.state, pending: null }), version: view.campaign.version + 1 } });
    if (updated.count !== 1) throw new ServiceError("Outra ação foi registrada ao mesmo tempo. Recarregue.", 409);
    await tx.actionLog.update({ where: { id: actionId }, data: { status: "REJECTED", result: json({ message: "Ação cancelada antes da rolagem.", cancelled: true }) } });
    await tx.narrativeEntry.create({ data: { campaignId: view.campaign.id, actionId, role: "SYSTEM", content: "Você desiste da tentativa antes de rolar os dados.", meta: json({ kind: "cancelled" }) } });
  });
  return { version: view.campaign.version + 1 };
}

async function duplicateResult(db: PrismaClient, log: { id: string; status: string; narration: string | null; result: unknown; campaignId: string }): Promise<SubmitResult> {
  const c = await db.campaign.findUniqueOrThrow({ where: { id: log.campaignId }, select: { version: true, state: true } });
  if (log.status === "PENDING") {
    const st = CampaignStateSchema.parse(c.state);
    if (st.pending?.actionId === log.id) return { status: "duplicate", actionId: log.id, request: st.pending.request, rolled: st.pending.rolls, version: c.version };
  }
  const r = log.result as (Outcome & { message?: string }) | null;
  return { status: "duplicate", actionId: log.id, outcome: r ?? undefined, narration: log.narration, message: r?.message, version: c.version };
}

async function recordNonAction(db: PrismaClient, view: CampaignView, key: string, playerText: string, kind: string, message: string, action?: PlayerAction) {
  await db.$transaction(async (tx) => {
    // Non-committing entries get negative sequences so they never collide with state versions.
    const minSeq = await tx.actionLog.findFirst({ where: { campaignId: view.campaign.id, sequence: { lt: 0 } }, orderBy: { sequence: "asc" }, select: { sequence: true } });
    await tx.actionLog.create({
      data: {
        campaignId: view.campaign.id,
        idempotencyKey: key,
        sequence: (minSeq?.sequence ?? 0) - 1,
        kind,
        input: json({ action: action ?? null, text: playerText }),
        result: json({ message }),
        status: "REJECTED",
        narration: message,
      },
    });
    await tx.narrativeEntry.createMany({
      data: [
        { campaignId: view.campaign.id, role: "PLAYER", content: playerText },
        // A clarifying question is the GM talking; rules answers and refusals are system notes.
        { campaignId: view.campaign.id, role: kind === "clarify" ? "GM" : "SYSTEM", content: message, meta: json({ kind }) },
      ],
    });
  });
}

/**
 * Narrates an already-resolved action. Safe to call repeatedly: it never
 * re-runs mechanics and does nothing once narration exists.
 */
export async function narrateAction(db: PrismaClient, gm: GmOrchestrator, playerId: string, campaignId: string, actionId: string): Promise<string | null> {
  const log = await db.actionLog.findFirst({ where: { id: actionId, campaignId, campaign: { ownerId: playerId } } });
  if (!log) throw new ServiceError("Ação não encontrada.", 404);
  if (log.narration) return log.narration;
  if (log.status !== "RESOLVED") return log.narration;
  try {
    const view = await getCampaignView(db, playerId, campaignId);
    const stored = log.result as unknown as Pick<ActionOutcome, "facts" | "suggestions" | "rolls" | "events"> & Partial<Pick<ActionOutcome, "beats" | "verdict">>;
    const input = log.input as { text: string | null; action: PlayerAction };
    const routine = ["move", "go", "observe"].includes(input.action.type) && !input.text;
    const n = await gm.narrate({ input: gmInput(view), outcome: stored, playerText: input.text ?? describeAction(input.action), actionType: input.action.type, routine });
    const dialogue = n.npcDialogue.map((d) => `— ${d.line} — diz ${view.blueprint.npcs.find((x) => x.id === d.npcId)?.name.split(" ")[0] ?? d.npcId}.`).join("\n");
    const text = dialogue ? `${n.narration}\n\n${dialogue}` : n.narration;
    const progress = (stored.beats ?? []).filter((b) => b.kind === "progress").map((b) => b.text);
    await db.$transaction(async (tx) => {
      const claimed = await tx.actionLog.updateMany({ where: { id: log.id, narration: null }, data: { narration: text, status: "NARRATED", result: json({ ...stored, gmNotes: n.gmNotes, effects: n.effects, provider: n.provider, degraded: n.degraded, guardIssues: n.issues }) } });
      if (claimed.count !== 1) return;
      await tx.narrativeEntry.create({ data: { campaignId, actionId: log.id, role: "GM", content: text, meta: json({ effects: n.effects, provider: n.provider, degraded: n.degraded }) } });
      if (progress.length) await tx.narrativeEntry.create({ data: { campaignId, actionId: log.id, role: "SYSTEM", content: progress.join(" "), meta: json({ kind: "progress" }) } });
    });
    return (await db.actionLog.findUniqueOrThrow({ where: { id: log.id } })).narration;
  } catch {
    // The action stays RESOLVED; the client can retry narration later.
    return null;
  }
}

const ACTION_TEXT: Record<PlayerAction["type"], string> = {
  move: "Você caminha até outro ponto.",
  go: "Você segue para outro cômodo.",
  observe: "Você observa ao redor.",
  interact: "Você examina algo de perto.",
  talk: "Você puxa conversa.",
  skill_check: "Você arrisca uma tentativa.",
  decide: "Você toma uma decisão.",
  attack: "Você ataca.",
  flee: "Você tenta fugir.",
  first_aid: "Você trata os ferimentos.",
  abandon: "Você abandona a missão.",
  narrative: "Você age.",
};

export function describeAction(a: PlayerAction): string {
  if (a.type === "narrative") return a.text;
  if (a.type === "talk" && a.message) return a.message;
  return ACTION_TEXT[a.type];
}
export type ClientView = ReturnType<typeof toClientView>;
