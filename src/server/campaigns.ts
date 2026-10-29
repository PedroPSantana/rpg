import "server-only";
import { generateNovelAdventure } from "@/modules/adventures/generator";
import { AdventureBlueprintSchema, FingerprintSchema, type AdventureBlueprint } from "@/modules/adventures/schema";
import { PlayerActionSchema, type PlayerAction } from "@/modules/campaign/actions";
import { resolveAction, type ActionOutcome } from "@/modules/campaign/engine";
import { CampaignStateSchema, conditionContextOf, initialCampaignState, type CampaignState } from "@/modules/campaign/state";
import { evaluate } from "@/modules/adventures/conditions";
import type { GmContextInput } from "@/modules/gm/context";
import type { GmOrchestrator } from "@/modules/gm/orchestrator";
import { getEdition, getSystem } from "@/modules/rules/registry";
import { cryptoRandom } from "@/modules/rules/core/crypto-random";
import { isPresent, playerView } from "@/modules/world/grid";
import type { RandomSource } from "@/modules/rules/core/random";
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
    db.narrativeEntry.findMany({ where: { campaignId: c.id }, orderBy: { createdAt: "asc" }, take: 400 }),
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
    narrative: narrative.map((n) => ({ id: n.id, role: n.role, content: n.content, meta: n.meta, createdAt: n.createdAt.toISOString() })),
    rolls: rolls.map((r) => ({ id: r.id, label: r.label, total: r.total, detail: r.detail, createdAt: r.createdAt.toISOString() })),
    actions: actions.map((a) => ({ id: a.id, sequence: a.sequence, kind: a.kind, status: a.status, narration: a.narration, result: a.result, createdAt: a.createdAt.toISOString() })),
    memories: memories.map((m) => m.content),
  };
}

export type CampaignView = Awaited<ReturnType<typeof getCampaignView>>;

/** Strips GM-only secrets before sending a view to the browser. */
export function toClientView(view: CampaignView) {
  const bp = view.blueprint;
  const st = view.state;
  return {
    ...view,
    state: {
      ...st,
      maps: Object.fromEntries(
        bp.maps.map((m) => {
          const ms = st.maps[m.id];
          return [m.id, { ...ms, objects: Object.fromEntries(Object.entries(ms.objects).filter(([id]) => isPresent(m, ms, id))) }];
        }),
      ),
    },
    blueprint: {
      ...bp,
      maps: bp.maps.map((m) => playerView(m, st.maps[m.id])),
      antagonist: st.mode === "ended" ? bp.antagonist : { name: "???", nature: "", motive: "" },
      npcs: bp.npcs.map((n) => ({ id: n.id, name: n.name, role: n.role, mapId: n.mapId, objectId: n.objectId })),
      clues: bp.clues.map((c) => ({ id: c.id, title: st.clues[c.id].discovered ? c.title : "???", description: st.clues[c.id].discovered ? c.description : "", importance: c.importance, mapId: c.mapId, objectId: c.objectId, discoveredBy: st.clues[c.id].discoveredBy })),
      threats: bp.threats.map((t) => ({ id: t.id, name: st.encounter || t.id in st.threatPv ? t.name : "???", description: t.description, pv: t.pv, element: t.element })),
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

function stripGmNotes(result: unknown) {
  if (result && typeof result === "object" && "gmNotes" in result) {
    const { gmNotes: _n, ...rest } = result as Record<string, unknown>;
    void _n;
    return rest;
  }
  return result;
}

export type SubmitInput = { idempotencyKey: string; expectedVersion?: number } & ({ action: PlayerAction } | { text: string });

export interface SubmitResult {
  status: "resolved" | "rejected" | "clarify" | "rules" | "duplicate";
  actionId?: string;
  message?: string;
  outcome?: Pick<ActionOutcome, "facts" | "rolls" | "events" | "mapEvents" | "suggestions">;
  narration?: string | null;
  version: number;
}

function gmInput(view: CampaignView): GmContextInput {
  return {
    blueprint: view.blueprint,
    state: view.state,
    sheet: view.character!.sheet,
    character: { ...view.character!.state, name: view.character!.name, concept: view.character!.build.concept },
    history: view.narrative.slice(-12).map((n) => ({ role: n.role, content: n.content })),
    memories: view.memories,
  };
}

/**
 * The action pipeline: idempotency → (AI interpretation) → deterministic
 * resolution → atomic commit → (AI narration). A completed action is never
 * lost or re-executed if narration fails.
 */
export async function submitAction(db: PrismaClient, gm: GmOrchestrator, playerId: string, campaignId: string, input: SubmitInput, rng: RandomSource = cryptoRandom): Promise<SubmitResult> {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(input.idempotencyKey)) throw new ServiceError("Chave de idempotência inválida.", 400);
  const existing = await db.actionLog.findFirst({ where: { campaignId, idempotencyKey: input.idempotencyKey, campaign: { ownerId: playerId } } });
  if (existing) return duplicateResult(db, existing);

  const view = await getCampaignView(db, playerId, campaignId);
  if (!view.character) throw new ServiceError("Crie um personagem antes de jogar.", 409);
  if (view.campaign.status === "ARCHIVED") throw new ServiceError("Campanha arquivada. Desarquive para continuar.", 409);
  if (input.expectedVersion !== undefined && input.expectedVersion !== view.campaign.version) {
    throw new ServiceError("O estado da campanha mudou. Recarregue para continuar.", 409);
  }

  let action: PlayerAction;
  let playerText: string | undefined;
  if ("text" in input) {
    playerText = input.text.trim().slice(0, 2000);
    if (!playerText) throw new ServiceError("Escreva o que seu personagem faz.", 400);
    const interp = await gm.interpret(gmInput(view), playerText);
    if (interp.kind !== "action") {
      const message = interp.kind === "clarify" ? interp.question : interp.answer;
      await recordNonAction(db, view, input.idempotencyKey, playerText, interp.kind, message);
      return { status: interp.kind, message, version: view.campaign.version };
    }
    action = interp.action;
  } else {
    const parsed = PlayerActionSchema.safeParse(input.action);
    if (!parsed.success) throw new ServiceError("Ação malformada.", 400, parsed.error.issues);
    action = parsed.data;
  }

  const result = resolveAction({ blueprint: view.blueprint, state: view.state, character: { build: view.character.build, sheet: view.character.sheet, state: view.character.state }, rng }, action);

  if (!result.ok) {
    await recordNonAction(db, view, input.idempotencyKey, playerText ?? describeAction(action), "rejected", result.reason, action);
    return { status: "rejected", message: result.reason, version: view.campaign.version };
  }

  const nextVersion = view.campaign.version + 1;
  let actionId: string;
  try {
    actionId = await db.$transaction(async (tx) => {
      const updated = await tx.campaign.updateMany({
        where: { id: view.campaign.id, version: view.campaign.version },
        data: { state: json(result.state), version: nextVersion, status: result.state.mode === "ended" ? "COMPLETED" : undefined },
      });
      if (updated.count !== 1) throw new ServiceError("Outra ação foi registrada ao mesmo tempo. Recarregue.", 409);
      await tx.character.update({ where: { id: view.character!.id }, data: { state: json(result.characterState) } });
      const log = await tx.actionLog.create({
        data: {
          campaignId: view.campaign.id,
          idempotencyKey: input.idempotencyKey,
          sequence: nextVersion,
          kind: action.type,
          input: json({ action, text: playerText ?? null }),
          result: json({ facts: result.facts, events: result.events, mapEvents: result.mapEvents, suggestions: result.suggestions, rolls: result.rolls }),
          status: "RESOLVED",
        },
      });
      if (result.rolls.length) {
        await tx.rollLog.createMany({ data: result.rolls.map((r) => ({ campaignId: view.campaign.id, actionId: log.id, label: r.label, detail: json(r), total: r.total })) });
      }
      await tx.narrativeEntry.create({ data: { campaignId: view.campaign.id, actionId: log.id, role: "PLAYER", content: playerText ?? describeAction(action) } });
      return log.id;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const dup = await db.actionLog.findFirst({ where: { campaignId, idempotencyKey: input.idempotencyKey } });
      if (dup) return duplicateResult(db, dup);
    }
    throw e;
  }

  const narration = await narrateAction(db, gm, playerId, campaignId, actionId);
  return {
    status: "resolved",
    actionId,
    outcome: { facts: result.facts, rolls: result.rolls, events: result.events, mapEvents: result.mapEvents, suggestions: result.suggestions },
    narration,
    version: nextVersion,
  };
}

async function duplicateResult(db: PrismaClient, log: { id: string; status: string; narration: string | null; result: unknown; campaignId: string }): Promise<SubmitResult> {
  const c = await db.campaign.findUniqueOrThrow({ where: { id: log.campaignId }, select: { version: true } });
  const r = log.result as SubmitResult["outcome"] & { message?: string };
  return { status: "duplicate", actionId: log.id, outcome: r, narration: log.narration, message: r?.message, version: c.version };
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
        { campaignId: view.campaign.id, role: "SYSTEM", content: message, meta: json({ kind }) },
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
    const stored = log.result as { facts: string[]; suggestions: string[]; rolls: ActionOutcome["rolls"]; events: ActionOutcome["events"] };
    const input = log.input as { text: string | null; action: PlayerAction };
    const routine = input.action.type === "move" && !input.text && !stored.events?.length && !stored.rolls?.length;
    const n = await gm.narrate({ input: gmInput(view), outcome: stored, playerText: input.text ?? describeAction(input.action), routine });
    const dialogue = n.npcDialogue.map((d) => `${view.blueprint.npcs.find((x) => x.id === d.npcId)?.name ?? d.npcId}: "${d.line}"`).join("\n");
    const text = dialogue ? `${n.narration}\n\n${dialogue}` : n.narration;
    await db.$transaction(async (tx) => {
      const claimed = await tx.actionLog.updateMany({ where: { id: log.id, narration: null }, data: { narration: text, status: "NARRATED", result: json({ ...stored, gmNotes: n.gmNotes, effects: n.effects, narrationSuggestions: n.suggestions, provider: n.provider, degraded: n.degraded }) } });
      if (claimed.count !== 1) return;
      await tx.narrativeEntry.create({ data: { campaignId, actionId: log.id, role: "GM", content: text, meta: json({ effects: n.effects, suggestions: n.suggestions, provider: n.provider, degraded: n.degraded }) } });
      if (n.memory) await tx.campaignMemory.create({ data: { campaignId, kind: "FACT", content: n.memory } });
    });
    return (await db.actionLog.findUniqueOrThrow({ where: { id: log.id } })).narration;
  } catch {
    // The action stays RESOLVED; the client can retry narration later.
    return null;
  }
}

const ACTION_TEXT: Record<PlayerAction["type"], string> = {
  move: "Você se move.",
  interact: "Você interage com o ambiente.",
  talk: "Você conversa.",
  skill_check: "Você tenta algo arriscado.",
  decide: "Você toma uma decisão.",
  attack: "Você ataca.",
  flee: "Você tenta fugir.",
  first_aid: "Você presta primeiros socorros.",
  abandon: "Você abandona a missão.",
  narrative: "Você age.",
};

export function describeAction(a: PlayerAction): string {
  if (a.type === "narrative") return a.text;
  if (a.type === "talk" && a.message) return a.message;
  return ACTION_TEXT[a.type];
}
export type ClientView = ReturnType<typeof toClientView>;
