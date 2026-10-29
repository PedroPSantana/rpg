import { evaluate, type ConditionContext } from "@/modules/adventures/conditions";
import type { AdventureBlueprint, ClueDef, NpcDef } from "@/modules/adventures/schema";
import { parseDice, rollExpression, type RollRecord } from "@/modules/rules/core/dice";
import type { RandomSource } from "@/modules/rules/core/random";
import { ALLOWED_DTS, SKILL_BY_ID } from "@/modules/rules/systems/ordem-paranormal/data";
import type { OpCharacterBuild, OpCharacterState, OpSheet } from "@/modules/rules/systems/ordem-paranormal/character";
import { planSkillCheck, skillCheck, type SkillCheckRequest, type SkillPower } from "@/modules/rules/systems/ordem-paranormal/tests";
import { applyMapEvent, validateMapEvent, type MapRegistry } from "@/modules/world/events";
import { areaAt, areaKey, areaOpenings, objectsInArea, pathToArea } from "@/modules/world/areas";
import { approachTile, doorsOnPath, findPath, isPresent } from "@/modules/world/grid";
import { areaProfile, placeKindOf } from "@/modules/world/scenes";
import type { MapEvent, MapObject, Position } from "@/modules/world/schema";
import type { PlayerAction } from "./actions";
import { DiceControl, RollRequired, type DiceMode, type DiceTape, type RollRequest } from "./dice";
import { combatAction, startEncounter } from "./encounter";
import { conditionContextOf, type CampaignState, type JournalEntry } from "./state";

export interface EngineContext {
  blueprint: AdventureBlueprint;
  state: CampaignState;
  character: { build: OpCharacterBuild; sheet: OpSheet; state: OpCharacterState };
  rng: RandomSource;
  /** Optional enemy tactic chosen by the GM; must be one of the threat's legal attacks. */
  enemyTactic?: string;
  /** How player dice are rolled. Defaults to "auto" (simulations and tests); live play uses "manual". */
  dice?: DiceMode;
}

/**
 * What the narrator may say. `facts` stays the flat list for logs and the AI;
 * beats carry the kind so narration can skip mechanics (shown on the dice)
 * and bookkeeping (shown in the journal) instead of reading them aloud.
 */
export type BeatKind = "narration" | "dialogue" | "discovery" | "arrival" | "mechanic" | "progress" | "danger";
export interface Beat {
  kind: BeatKind;
  text: string;
  npcId?: string;
}

export type DomainEvent =
  | { type: "clue_discovered"; clueId: string }
  | { type: "urgency"; delta: number; total: number }
  | { type: "item_gained"; itemId: string }
  | { type: "npc_updated"; npcId: string }
  | { type: "encounter_started"; encounterId: string }
  | { type: "encounter_resolved"; encounterId: string; outcome: "victory" | "fled" | "defeat" }
  | { type: "quest_updated"; questId: string; objectiveId?: string; status?: string }
  | { type: "decision_made"; decisionId: string; optionId: string }
  | { type: "ending"; endingId: string }
  | { type: "resource"; resource: "pv" | "pe" | "san"; delta: number };

export interface ActionOutcome {
  ok: true;
  state: CampaignState;
  characterState: OpCharacterState;
  rolls: RollRecord[];
  events: DomainEvent[];
  mapEvents: MapEvent[];
  /** Authoritative facts the narrator must respect (pt-BR). */
  facts: string[];
  beats: Beat[];
  /** GM-only hints about alternatives (never shown to the player as prescribed actions). */
  suggestions: string[];
  /** Overall result of the attempt, for checking that narration agrees with the dice. */
  verdict: "success" | "failure" | "mixed" | "none";
  /** Dice recorded while resolving (manual mode). */
  tape: DiceTape;
}

export type ActionResult = ActionOutcome | { ok: false; reason: string; ruleId?: string };

export type RunResult = ActionResult | { ok: "roll"; request: RollRequest; tape: DiceTape; rolls: RollRecord[]; playerRolls: number };

function inRect(r: { x: number; y: number; w: number; h: number }, p: Position) {
  return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
}

export class ActionRejected extends Error {
  constructor(
    public reason: string,
    public ruleId?: string,
  ) {
    super(reason);
  }
}

/** Mutable working copy for a single action; discarded if the action is rejected. */
export class Resolution {
  state: CampaignState;
  char: OpCharacterState;
  rolls: RollRecord[] = [];
  events: DomainEvent[] = [];
  mapEvents: MapEvent[] = [];
  beats: Beat[] = [];
  suggestions: string[] = [];
  readonly defs: MapRegistry;
  readonly dice: DiceControl;
  private successes = 0;
  private failures = 0;

  constructor(public ctx: EngineContext) {
    this.state = structuredClone(ctx.state);
    this.char = structuredClone(ctx.character.state);
    this.defs = Object.fromEntries(ctx.blueprint.maps.map((m) => [m.id, m]));
    this.dice = new DiceControl(ctx.dice ?? { kind: "auto" }, ctx.rng);
  }

  get facts() {
    return this.beats.map((b) => b.text);
  }

  get bp() {
    return this.ctx.blueprint;
  }
  get sheet() {
    return this.ctx.character.sheet;
  }
  /** Dice for the world (enemies, effects on the agent). Player dice go through playerRoll. */
  get rng() {
    return this.dice.world;
  }

  fact(text: string, kind: BeatKind = "narration", npcId?: string) {
    if (text) this.beats.push({ kind, text, ...(npcId ? { npcId } : {}) });
  }

  remember(kind: JournalEntry["kind"], text: string, source: string | null = null, npcId: string | null = null) {
    if (this.state.journal.some((j) => j.text === text)) return;
    this.state.journal.push({ kind, text, source, npcId, at: this.state.actionCount });
  }

  /** Counts a resolved player test toward the action's overall verdict. */
  tally(outcome: RollRecord["outcome"]) {
    if (outcome === "success" || outcome === "critical") this.successes++;
    else if (outcome === "failure") this.failures++;
  }

  verdict(): ActionOutcome["verdict"] {
    if (this.successes && this.failures) return "mixed";
    if (this.successes) return "success";
    if (this.failures) return "failure";
    return "none";
  }

  /** A roll made by the player's character: in manual mode the player must click for it. */
  playerRoll<T>(request: Omit<RollRequest, "index">, roll: (rng: RandomSource) => T): T {
    return this.dice.player(request, roll, this.ctx.rng);
  }

  map(event: MapEvent) {
    const check = validateMapEvent(this.defs, this.state.maps, this.state.currentMapId, event);
    if (!check.ok) throw new ActionRejected(check.reason, "world.map-event");
    const next = applyMapEvent(this.defs, this.state.maps, event);
    this.state.maps = next.maps;
    if (next.currentMapId) this.state.currentMapId = next.currentMapId;
    this.mapEvents.push(event);
  }

  objectState(mapId: string, objectId: string) {
    const def = this.defs[mapId].objects.find((o) => o.id === objectId);
    return this.state.maps[mapId].objects[objectId]?.state ?? def?.initialState ?? "";
  }

  setObjectState(mapId: string, objectId: string, to: string) {
    if (this.objectState(mapId, objectId) !== to) this.map({ type: "set_object_state", mapId, objectId, state: to });
  }

  spendPe(amount: number) {
    if (!amount) return;
    if (amount > this.char.pe) throw new ActionRejected(`PE insuficientes (precisa de ${amount}, tem ${this.char.pe}).`, "op-core.resources.pe");
    this.char.pe -= amount;
    this.events.push({ type: "resource", resource: "pe", delta: -amount });
    this.fact(`Você gastou ${amount} PE (restam ${this.char.pe}).`, "mechanic");
  }

  check(req: SkillCheckRequest, stakes: string) {
    const plan = planSkillCheck(this.sheet, this.char, req);
    if (!plan.ok) throw new ActionRejected(plan.reason, plan.ruleId);
    const n = plan.attribute + (req.diceModifier ?? 0);
    const count = n >= 1 ? n : 2 - n;
    const request = {
      kind: "test" as const,
      label: req.label ?? plan.skill.name,
      skillId: plan.skill.id,
      expression: `${count}d20 (${n >= 1 ? "maior" : "menor"})`,
      dice: { count, sides: 20, keep: n >= 1 ? ("highest" as const) : ("lowest" as const) },
      modifiers: plan.modifiers.filter((m) => m.value !== 0),
      extraDice: plan.extraDice,
      target: req.dt ?? null,
      targetLabel: req.dt !== undefined ? ("DT" as const) : null,
      peCost: plan.peCost,
      stakes,
    };
    const result = this.playerRoll(request, (rng) => skillCheck(this.sheet, this.char, req, rng));
    if (!result.ok) throw new ActionRejected(result.reason, result.ruleId);
    this.spendPe(result.peCost);
    this.char.sceneUses.push(...result.sceneUses);
    this.rolls.push(result.roll);
    this.tally(result.roll.outcome);
    const skill = SKILL_BY_ID.get(req.skillId)!;
    this.fact(`Teste de ${skill.name}: ${result.roll.total}${req.dt !== undefined ? ` contra DT ${req.dt}` : ""} — ${result.roll.outcome === "success" ? "sucesso" : result.roll.outcome === "failure" ? "falha" : "resultado registrado"}.`, "mechanic");
    return result.roll;
  }

  addUrgency(delta: number, reason: string) {
    if (delta <= 0) return;
    this.state.urgency = Math.min(this.bp.urgency.max, this.state.urgency + delta);
    this.events.push({ type: "urgency", delta, total: this.state.urgency });
    this.fact(`Urgência +${delta} (${this.state.urgency}/${this.bp.urgency.max}): ${reason}`, "mechanic");
    for (const eff of this.bp.urgency.effects) {
      if (eff.at <= this.state.urgency && !this.state.urgencyEffectsApplied.includes(eff.at)) {
        this.state.urgencyEffectsApplied.push(eff.at);
        this.state.flags[eff.flag] = true;
        this.fact(eff.text, "danger");
        this.remember("event", eff.text);
      }
    }
  }

  hasItem(itemId: string) {
    return this.char.inventory.some((i) => i.itemId === itemId && i.quantity > 0);
  }

  gainItem(itemId: string) {
    if (this.hasItem(itemId)) return false;
    const item = this.bp.items.find((i) => i.id === itemId);
    if (!item) throw new Error(`Item de aventura inexistente: ${itemId}`);
    this.char.inventory.push({ itemId, name: item.name, quantity: 1, equipped: false, story: true });
    this.events.push({ type: "item_gained", itemId });
    this.fact(`Item obtido: ${item.name}.`, "progress");
    this.remember("event", `Você obteve ${item.name}: ${item.description}`);
    return true;
  }

  discoverClue(clue: ClueDef, by: string) {
    const entry = this.state.clues[clue.id];
    if (entry.discovered) return;
    entry.discovered = true;
    entry.discoveredBy = by;
    this.events.push({ type: "clue_discovered", clueId: clue.id });
    this.fact(clue.description, "discovery");
    this.fact(`Pista registrada: ${clue.title}.`, "progress");
    const npc = this.bp.npcs.find((n) => n.name === by);
    this.remember(npc ? "statement" : "fact", `${clue.title}: ${clue.description}`, by, npc?.id ?? null);
    if (clue.mapId && this.defs[clue.mapId].objects.some((o) => o.id === clue.objectId && o.kind === "clue")) {
      this.setObjectState(clue.mapId, clue.objectId, "found");
    }
    for (const objectId of clue.reveals.objects) {
      const mapId = this.bp.maps.find((m) => m.objects.some((o) => o.id === objectId))!.id;
      if (!this.state.maps[mapId].objects[objectId]?.revealed) {
        this.map({ type: "reveal_object", mapId, objectId });
        const revealed = this.defs[mapId].objects.find((o) => o.id === objectId)!;
        this.fact(`Agora você sabe onde fica: ${revealed.name.toLowerCase()}.`);
        this.remember("fact", `Existe ${revealed.name.toLowerCase()} em ${this.defs[mapId].name}.`);
      }
    }
    for (const f of clue.reveals.flags) this.state.flags[f] = true;
  }

  conditionContext(): ConditionContext {
    return conditionContextOf(this.state);
  }

  /** Moves along a validated path, firing area triggers on the way. Returns false if interrupted by an encounter. */
  walk(path: Position[]) {
    if (path.length < 2) return true;
    const mapId = this.state.currentMapId;
    const def = this.defs[mapId];
    const fromArea = areaAt(def, this.state.maps[mapId].player)?.id;
    for (const d of doorsOnPath(def, this.state.maps[mapId], path)) {
      this.setObjectState(mapId, d.id, "open");
    }
    for (let i = 1; i < path.length; i++) {
      const p = path[i];
      this.state.maps[mapId].player = p;
      if (this.areaTrigger(mapId, p, () => this.arrive(mapId, fromArea))) {
        this.mapEvents.push({ type: "move_player", mapId, to: p });
        return false;
      }
    }
    this.mapEvents.push({ type: "move_player", mapId, to: path[path.length - 1] });
    this.arrive(mapId, fromArea);
    return true;
  }

  /** Describes the room the agent just stepped into (fully the first time, briefly afterwards). */
  arrive(mapId: string, fromAreaId: string | undefined) {
    const def = this.defs[mapId];
    const area = areaAt(def, this.state.maps[mapId].player);
    if (!area || area.id === fromAreaId) return;
    const key = areaKey(mapId, area.id);
    const first = !this.state.areasVisited.includes(key);
    if (first) this.state.areasVisited.push(key);
    const profile = areaProfile(def, area.id, { place: this.bp.setting.place, placeKind: placeKindOf(this.bp.maps) });
    this.fact(first ? profile.first : profile.again, "arrival");
    if (first) this.remember("event", `Entrou em ${area.name} (${def.name}).`);
  }

  private areaTrigger(mapId: string, p: Position, beforeEncounter: () => void) {
    for (const enc of this.bp.encounters) {
      if (enc.mapId !== mapId || enc.id in this.state.encountersResolved || this.state.encounter) continue;
      const area = this.defs[mapId].areas.find((a) => a.id === enc.triggerArea);
      if (area && p.x >= area.rect.x && p.x < area.rect.x + area.rect.w && p.y >= area.rect.y && p.y < area.rect.y + area.rect.h) {
        beforeEncounter();
        startEncounter(this, enc.id);
        return true;
      }
    }
    return false;
  }

  /** Walks next to an object if needed. */
  approach(mapId: string, objectId: string) {
    if (mapId !== this.state.currentMapId) throw new ActionRejected("Esse objeto não está no local atual.", "world.map-event");
    const def = this.defs[mapId];
    const obj = def.objects.find((o) => o.id === objectId);
    if (!obj || !isPresent(def, this.state.maps[mapId], objectId)) throw new ActionRejected("Você não vê esse objeto aqui.", "world.map-event");
    // Walking up to something should not wander through an unresolved encounter's area on the way.
    const danger = this.bp.encounters
      .filter((e) => e.mapId === mapId && !(e.id in this.state.encountersResolved))
      .flatMap((e) => def.areas.filter((a) => a.id === e.triggerArea))
      .filter((a) => !inRect(a.rect, obj.position));
    const avoid = danger.length ? (p: Position) => danger.some((a) => inRect(a.rect, p)) : undefined;
    const path = approachTile(def, this.state.maps[mapId], this.state.maps[mapId].player, obj.position, { passClosedDoors: true, avoid });
    if (!path) throw new ActionRejected(`Não há caminho livre até ${obj.name}.`, "world.navigation");
    return { obj, uninterrupted: this.walk(path) };
  }

  finalize(): ActionOutcome {
    const ctx = () => this.conditionContext();
    for (const d of this.bp.derivedFlags) {
      if (!this.state.flags[d.flag] && evaluate(d.when, ctx())) {
        this.state.flags[d.flag] = true;
        if (d.flag === "conhece-fraqueza") {
          this.fact(`Juntando o que descobriu, você entende como a ameaça pode ser enfraquecida: ${this.bp.threats[0].weakness.description}`, "discovery");
          this.remember("fact", `Fraqueza da ameaça: ${this.bp.threats[0].weakness.description}`, "dedução");
        }
      }
    }
    if (this.state.flags["ameaca-cacando"] && !this.state.encounter && this.state.mode === "exploration") {
      const enc = this.bp.encounters.find((e) => !(e.id in this.state.encountersResolved));
      if (enc) startEncounter(this, enc.id);
    }
    for (const q of this.bp.quests) {
      const qs = this.state.quests[q.id];
      if (qs.status !== "active") continue;
      for (const o of q.objectives) {
        if (!qs.objectives[o.id] && evaluate(o.when, ctx())) {
          qs.objectives[o.id] = true;
          this.events.push({ type: "quest_updated", questId: q.id, objectiveId: o.id });
          this.fact(`Objetivo cumprido: ${o.text}.`, "progress");
        }
      }
      if (q.failWhen && evaluate(q.failWhen, ctx())) {
        qs.status = "failed";
        this.events.push({ type: "quest_updated", questId: q.id, status: "failed" });
        this.fact(`Missão falhou: ${q.title}.`, "progress");
      } else if (q.objectives.filter((o) => !o.optional).every((o) => qs.objectives[o.id])) {
        qs.status = "completed";
        this.events.push({ type: "quest_updated", questId: q.id, status: "completed" });
        this.fact(`Missão concluída: ${q.title}.`, "progress");
      }
    }
    if (!this.state.ending) {
      const ending = [...this.bp.endings].sort((a, b) => b.priority - a.priority).find((e) => evaluate(e.when, ctx()));
      if (ending) {
        this.state.ending = { id: ending.id, title: ending.title, tone: ending.tone, summary: ending.summary, rewards: ending.rewards };
        this.state.mode = "ended";
        this.state.encounter = null;
        this.events.push({ type: "ending", endingId: ending.id });
        this.fact(ending.summary, "narration");
        this.fact(`Fim da investigação: ${ending.title}.`, "progress");
        if (!this.state.rewardsGranted) {
          this.state.rewardsGranted = true;
          if (ending.rewards.prestige || ending.rewards.nexGain) {
            this.fact(`Recompensas: +${ending.rewards.prestige} pontos de prestígio, +${ending.rewards.nexGain}% de NEX (registrado; a progressão de NEX ainda não está implementada). ${ending.rewards.note}`, "progress");
          } else this.fact(ending.rewards.note, "progress");
        }
      }
    }
    this.state.actionCount += 1;
    return {
      ok: true,
      state: this.state,
      characterState: this.char,
      rolls: this.rolls,
      events: this.events,
      mapEvents: this.mapEvents,
      facts: this.facts,
      beats: this.beats,
      suggestions: this.suggestions,
      verdict: this.verdict(),
      tape: this.dice.tape,
    };
  }
}

/**
 * The authoritative action resolver. Pure given its dice: same context +
 * action + dice ⇒ same outcome. Never mutates its inputs. In manual dice mode
 * it stops at the first player roll it has no die for and returns the
 * request instead of an outcome.
 */
export function runAction(ctx: EngineContext, action: PlayerAction): RunResult {
  const r = new Resolution(ctx);
  try {
    if (ctx.state.mode === "ended" && action.type !== "narrative" && action.type !== "observe") throw new ActionRejected("A missão já terminou.", "campaign.ended");
    if (r.state.mode === "combat" && !["attack", "flee", "first_aid", "narrative", "observe"].includes(action.type)) {
      throw new ActionRejected("Em combate só é possível atacar, fugir, prestar primeiros socorros ou descrever a cena.", "op-core.combat.actions");
    }
    switch (action.type) {
      case "move":
        move(r, action.to);
        break;
      case "go":
        go(r, action.areaId);
        break;
      case "observe":
        observe(r, action.objectId);
        break;
      case "interact":
        interact(r, action);
        break;
      case "talk":
        talk(r, action);
        break;
      case "skill_check":
        improvisedCheck(r, action);
        break;
      case "decide":
        decide(r, action.optionId);
        break;
      case "attack":
      case "flee":
        combatAction(r, action);
        break;
      case "first_aid":
        if (r.state.mode === "combat") combatAction(r, action);
        else firstAid(r);
        break;
      case "abandon":
        abandon(r);
        break;
      case "narrative":
        r.fact("Ação descritiva: nenhuma regra foi acionada e o estado do jogo não mudou.", "mechanic");
        break;
    }
    return r.finalize();
  } catch (e) {
    if (e instanceof ActionRejected) return { ok: false, reason: e.reason, ruleId: e.ruleId };
    if (e instanceof RollRequired) return { ok: "roll", request: e.request, tape: r.dice.tape, rolls: r.rolls, playerRolls: r.dice.playerRolls };
    throw e;
  }
}

/** Resolves an action with automatic dice (simulations, evals and tests). */
export function resolveAction(ctx: EngineContext, action: PlayerAction): ActionResult {
  const result = runAction({ ...ctx, dice: ctx.dice ?? { kind: "auto" } }, action);
  if (result.ok === "roll") throw new Error("resolveAction não aceita dados manuais; use runAction.");
  return result;
}

function move(r: Resolution, to: Position) {
  const mapId = r.state.currentMapId;
  const def = r.defs[mapId];
  const path = findPath(def, r.state.maps[mapId], r.state.maps[mapId].player, to, { passClosedDoors: true });
  if (!path) throw new ActionRejected("Destino bloqueado ou inalcançável.", "world.navigation");
  r.walk(path);
}

function go(r: Resolution, areaId: string) {
  let mapId = r.state.currentMapId;
  if (!r.defs[mapId].areas.some((a) => a.id === areaId)) {
    // A room of the other side of the exit: walk through it first (the door may stop us).
    const exit = r.defs[mapId].objects.find((o) => o.kind === "exit" && o.leadsTo && r.defs[o.leadsTo.mapId].areas.some((a) => a.id === areaId) && isPresent(r.defs[mapId], r.state.maps[mapId], o.id));
    if (!exit) throw new ActionRejected("Você não conhece esse lugar daqui.", "world.navigation");
    const { uninterrupted } = r.approach(mapId, exit.id);
    if (!uninterrupted) return;
    door(r, mapId, exit.id, "enter", r.objectState(mapId, exit.id));
    if (r.state.currentMapId === mapId) return;
    mapId = r.state.currentMapId;
  }
  const def = r.defs[mapId];
  const ms = r.state.maps[mapId];
  const area = def.areas.find((a) => a.id === areaId);
  if (!area || (area.hidden && !ms.revealedAreas.includes(area.id))) throw new ActionRejected("Você não conhece esse lugar aqui.", "world.navigation");
  if (areaAt(def, ms.player)?.id === area.id) {
    if (!r.beats.some((b) => b.kind === "arrival")) r.fact(`Você já está em ${area.name.toLowerCase()}.`, "narration");
    return;
  }
  const path = pathToArea(def, ms, ms.player, area.id, { passClosedDoors: true });
  if (!path) {
    const blocked = areaOpenings(def, ms, area.id).find((o) => ["locked", "closed"].includes(r.objectState(mapId, o.object.id)));
    throw new ActionRejected(blocked ? `${blocked.object.name} está trancada. Você precisa abri-la de outro jeito antes de entrar em ${area.name.toLowerCase()}.` : `Não há caminho livre até ${area.name.toLowerCase()}.`, "world.navigation");
  }
  r.walk(path);
}

/** Looking costs nothing and changes nothing; it only reports what is visible from where the agent stands. */
function observe(r: Resolution, objectId?: string) {
  const mapId = r.state.currentMapId;
  const def = r.defs[mapId];
  const ms = r.state.maps[mapId];
  const area = areaAt(def, ms.player);
  if (objectId) {
    const obj = def.objects.find((o) => o.id === objectId);
    if (!obj || !isPresent(def, ms, objectId)) throw new ActionRejected("Você não vê isso daqui.", "world.interaction");
    r.fact(describeObject(r, mapId, obj), "narration");
    return;
  }
  if (!area) return;
  const profile = areaProfile(def, area.id, { place: r.bp.setting.place, placeKind: placeKindOf(r.bp.maps) });
  r.fact(profile.first, "narration");
  const things = objectsInArea(def, ms, area.id).filter((o) => o.kind !== "threat");
  const people = things.filter((o) => o.kind === "npc").map((o) => o.name);
  const objects = things.filter((o) => o.kind !== "npc").map((o) => o.name.toLowerCase());
  if (people.length) r.fact(`${listPt(people)} ${people.length > 1 ? "estão" : "está"} aqui.`, "narration");
  if (objects.length) r.fact(`Chamam sua atenção: ${listPt(objects)}.`, "narration");
  const ways = areaOpenings(def, ms, area.id).map((o) => {
    const st = r.objectState(mapId, o.object.id);
    const to = o.toAreaId ? def.areas.find((a) => a.id === o.toAreaId)!.name.toLowerCase() : o.object.kind === "exit" ? "a saída" : "outro cômodo";
    return `${to} (${st === "open" || st === "broken" ? "aberta" : "fechada"})`;
  });
  if (ways.length) r.fact(`Daqui dá para seguir para ${listPt(ways)}.`, "narration");
}

function describeObject(r: Resolution, mapId: string, obj: MapObject) {
  const st = r.objectState(mapId, obj.id);
  if (obj.kind === "door" || obj.kind === "exit") return `${obj.name}: ${st === "open" ? "está aberta" : st === "broken" ? "foi arrombada" : "está fechada"}.`;
  if (obj.kind === "npc") {
    const npc = r.bp.npcs.find((n) => n.objectId === obj.id);
    return npc ? `${npc.name}, ${npc.role}. ${npc.personality}` : obj.description;
  }
  if (obj.kind === "clue") {
    const clue = r.bp.clues.find((c) => c.objectId === obj.id);
    if (clue && r.state.clues[clue.id].discovered) return `${obj.name}. Você já examinou isto: ${clue.description}`;
    return `${obj.name}. ${obj.description} Daqui não dá para tirar conclusões; seria preciso examinar de perto.`;
  }
  if (obj.kind === "container") return `${obj.name}. ${obj.description}${st === "searched" ? " Você já revirou o que havia ali." : ""}`;
  return `${obj.name}. ${obj.description}`;
}

function listPt(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

type InteractAction = Extract<PlayerAction, { type: "interact" }>;

function interact(r: Resolution, a: InteractAction) {
  const mapId = r.state.currentMapId;
  const { obj, uninterrupted } = r.approach(mapId, a.objectId);
  if (!uninterrupted) return;
  const state = r.objectState(mapId, obj.id);
  if (!obj.verbs.includes(a.verb)) throw new ActionRejected(`Não é possível usar "${a.verb}" em ${obj.name}.`, "world.interaction");

  switch (obj.kind) {
    case "clue":
      return searchClue(r, mapId, obj.id, a);
    case "door":
    case "exit":
      return door(r, mapId, obj.id, a.verb, state);
    case "container":
      return container(r, mapId, obj.id, a.verb, state);
    case "npc":
      if (a.verb === "talk") return talk(r, { type: "talk", npcId: npcByObject(r, obj.id).id, approach: "conversar", powers: [] });
      r.fact(describeObject(r, mapId, obj));
      return;
    case "threat": {
      const enc = r.bp.encounters.find((e) => e.objectId === obj.id);
      r.fact(obj.description);
      if (enc && !(enc.id in r.state.encountersResolved)) startEncounter(r, enc.id);
      return;
    }
    case "artifact": {
      r.fact(`${obj.name}: ${obj.description}`);
      const enc = r.bp.encounters[0];
      if (enc && !(enc.id in r.state.encountersResolved)) {
        r.fact("Ao tocar o objeto, a presença que o guarda desperta.", "danger");
        startEncounter(r, enc.id);
        return;
      }
      if (evaluate(r.bp.decision.availableWhen, r.conditionContext()) && !(r.bp.decision.id in r.state.decisions)) {
        r.fact(r.bp.decision.prompt);
        for (const o of r.bp.decision.options) r.suggestions.push(`${o.label}: ${o.description}`);
      }
      return;
    }
    default:
      r.fact(`${obj.name}: ${obj.description}`);
  }
}

function npcByObject(r: Resolution, objectId: string): NpcDef {
  const npc = r.bp.npcs.find((n) => n.objectId === objectId);
  if (!npc) throw new ActionRejected("Ninguém responde.", "world.interaction");
  return npc;
}

function searchClue(r: Resolution, mapId: string, objectId: string, a: InteractAction) {
  const clue = r.bp.clues.find((c) => c.objectId === objectId && c.mapId === mapId);
  const obj = r.defs[mapId].objects.find((o) => o.id === objectId)!;
  if (!clue) {
    r.fact(`${obj.description} Você procura com calma, mas não há nada de útil ali.`);
    return;
  }
  const entry = r.state.clues[clue.id];
  if (entry.discovered) {
    r.fact(`Você já examinou isto. ${clue.description}`);
    return;
  }
  const methods = clue.discovery.filter((d) => d.method === "check");
  const auto = clue.discovery.find((d) => d.method === "auto");
  if (auto) return r.discoverClue(clue, "observação");

  // Choose the requested skill, or the best usable method for this character.
  const usable = methods.filter((m) => {
    const s = SKILL_BY_ID.get(m.skill)!;
    const entrySkill = r.sheet.skills.find((k) => k.id === m.skill)!;
    return !s.trainedOnly || entrySkill.grade !== "untrained" || a.powers.includes("eclético");
  });
  let method = a.skillId ? methods.find((m) => m.skill === a.skillId) : undefined;
  if (a.skillId && !method) {
    const names = methods.map((m) => SKILL_BY_ID.get(m.skill)!.name).join(", ");
    throw new ActionRejected(`${SKILL_BY_ID.get(a.skillId)?.name ?? a.skillId} não serve para examinar isto. Abordagens possíveis: ${names}.`, "rpg.investigation");
  }
  if (!method) {
    method = [...usable].sort((x, y) => {
      const bx = r.sheet.skills.find((k) => k.id === x.skill)!.bonus + r.sheet.attributes[SKILL_BY_ID.get(x.skill)!.attribute] * 2 - x.dt;
      const by = r.sheet.skills.find((k) => k.id === y.skill)!.bonus + r.sheet.attributes[SKILL_BY_ID.get(y.skill)!.attribute] * 2 - y.dt;
      return by - bx;
    })[0];
  }
  if (!method) {
    const names = methods.map((m) => SKILL_BY_ID.get(m.skill)!.name).join(" ou ");
    r.fact(`${obj.description} Você olha com atenção, mas não tem o preparo para entender o que está vendo (seria preciso ${names}). Talvez alguém saiba explicar.`);
    return;
  }
  const skillName = SKILL_BY_ID.get(method.skill)!.name;
  const cost = clue.failure.urgency ? " Se falhar, você perde tempo e a urgência aumenta." : "";
  const roll = r.check(
    { skillId: method.skill, dt: method.dt, powers: a.powers as SkillPower[], searchingClues: true, label: `${skillName}: ${obj.name}` },
    `Há algo em ${obj.name.toLowerCase()}, mas não está à vista. Encontrar e entender exige ${skillName}.${cost}`,
  );
  entry.attempts += 1;
  if (roll.outcome === "success") {
    r.discoverClue(clue, skillName);
  } else {
    r.fact(clue.failure.text);
    if (r.state.maps[mapId].objects[objectId].state === "untouched") r.setObjectState(mapId, objectId, "searched");
    r.addUrgency(clue.failure.urgency, "o tempo passa enquanto você procura");
    const others = methods.filter((m) => m !== method).map((m) => SKILL_BY_ID.get(m.skill)!.name);
    if (others.length) r.suggestions.push(`Outra abordagem possível: ${others.join(", ")}.`);
    const knower = r.bp.npcs.find((n) => n.knows.includes(clue.id));
    if (knower) r.suggestions.push(`${knower.name} sabe algo sobre isso.`);
  }
}

function door(r: Resolution, mapId: string, objectId: string, verb: string, state: string) {
  const obj = r.defs[mapId].objects.find((o) => o.id === objectId)!;
  const name = obj.name.toLowerCase();
  const lock = r.bp.locks.find((l) => l.objectId === objectId);
  switch (verb) {
    case "inspect":
      r.fact(state === "locked" ? `Você testa a maçaneta de ${name}: está trancada.` : state === "open" ? `${obj.name} está aberta.` : state === "broken" ? `${obj.name} foi arrombada; o batente está lascado.` : `${obj.name} está fechada, mas não parece trancada.`);
      if (state === "locked") {
        lockHints(r, lock);
        r.remember("fact", `${obj.name} está trancada.`, "observação");
      }
      return;
    case "close":
      if (state !== "open") throw new ActionRejected(`${obj.name} não está aberta.`, "world.interaction");
      r.setObjectState(mapId, objectId, "closed");
      r.fact(`Você fecha ${name}.`);
      return;
    case "open":
    case "enter":
      if (state === "locked") {
        r.fact(`Você gira a maçaneta de ${name}, mas ela não cede: está trancada.`);
        r.remember("fact", `${obj.name} está trancada.`, "observação");
        lockHints(r, lock);
        return;
      }
      if (state === "closed") {
        r.setObjectState(mapId, objectId, "open");
        if (!(obj.kind === "exit" && obj.leadsTo)) r.fact(`${obj.name} se abre.`);
      }
      if (obj.kind === "exit" && obj.leadsTo) travel(r, mapId, obj.leadsTo);
      return;
    case "unlock": {
      if (state !== "locked") throw new ActionRejected(`${obj.name} não está trancada.`, "world.interaction");
      if (lock?.keyItem && r.hasItem(lock.keyItem)) {
        r.setObjectState(mapId, objectId, "closed");
        r.fact(`A ${r.bp.items.find((i) => i.id === lock.keyItem)!.name.toLowerCase()} entra na fechadura e gira. ${obj.name} está destrancada.`);
        r.remember("event", `Você destrancou ${name}.`);
        return;
      }
      if (!lock?.pick) throw new ActionRejected("Você não tem a chave e esta fechadura não pode ser aberta com ferramentas.", "world.interaction");
      const roll = r.check({ skillId: lock.pick.skill, dt: lock.pick.dt, label: `Abrir fechadura: ${obj.name}` }, `Abrir a fechadura de ${name} sem a chave. Se falhar, você perde tempo (urgência +1).`);
      if (roll.outcome === "success") {
        r.setObjectState(mapId, objectId, "closed");
        r.fact("A fechadura cede com um clique seco.");
        r.remember("event", `Você abriu a fechadura de ${name}.`);
      } else {
        r.fact("Os pinos não se alinham; a fechadura continua trancada.");
        r.addUrgency(1, "você perde tempo com a fechadura");
      }
      return;
    }
    case "force": {
      if (state !== "locked" && state !== "closed") throw new ActionRejected(`Não há por que arrombar ${name}.`, "world.interaction");
      const force = lock?.force ?? { skill: "atletismo", dt: 10 };
      const bonus = r.hasItem("pe-de-cabra") ? [{ source: "Pé de cabra", value: 5 }] : [];
      const noise = lock?.noiseUrgency ?? 1;
      const roll = r.check({ skillId: force.skill, dt: force.dt, situational: bonus, label: `Arrombar: ${obj.name}` }, `Forçar ${name}. Dando certo ou não, o barulho vai ecoar pelo lugar (urgência +${noise}).`);
      if (roll.outcome === "success") {
        r.setObjectState(mapId, objectId, state === "locked" ? "broken" : "open");
        r.fact(`${obj.name} cede com um estrondo e bate contra a parede.`);
        r.remember("event", `Você arrombou ${name}.`);
      } else r.fact(`${obj.name} range, mas aguenta.`);
      r.addUrgency(noise, "o barulho ecoa pelo lugar");
      return;
    }
  }
  throw new ActionRejected(`Ação "${verb}" não se aplica a portas.`, "world.interaction");
}

function lockHints(r: Resolution, lock: AdventureBlueprint["locks"][number] | undefined) {
  if (!lock) return;
  if (lock.keyItem) r.suggestions.push(r.hasItem(lock.keyItem) ? "O agente carrega a chave desta porta." : "Alguém da história tem a chave.");
  if (lock.pick) r.suggestions.push(`A fechadura pode ser aberta com ${SKILL_BY_ID.get(lock.pick.skill)!.name}.`);
  if (lock.force) r.suggestions.push(`A porta pode ser arrombada com ${SKILL_BY_ID.get(lock.force.skill)!.name} (barulho).`);
}

function travel(r: Resolution, fromMapId: string, to: { mapId: string; spawn: string }) {
  r.map({ type: "transition", fromMapId, toMapId: to.mapId, spawn: to.spawn });
  r.state.scene += 1;
  r.char.sceneUses = [];
  r.arrive(to.mapId, undefined);
}

function container(r: Resolution, mapId: string, objectId: string, verb: string, state: string) {
  const obj = r.defs[mapId].objects.find((o) => o.id === objectId)!;
  if (verb === "inspect") {
    r.fact(`${obj.description}${state === "searched" ? " Você já revirou o que havia ali." : ""}`);
    return;
  }
  if (state === "closed") r.setObjectState(mapId, objectId, "open");
  const items = r.bp.items.filter((i) => i.objectId === objectId);
  if (r.objectState(mapId, objectId) === "open") r.setObjectState(mapId, objectId, "searched");
  const gained = items.filter((i) => r.gainItem(i.id));
  for (const item of gained) r.fact(`Ao revirar, você encontra: ${item.name.toLowerCase()}. ${item.description}`);
  if (!gained.length) r.fact(`Você revira ${obj.name.toLowerCase()}, mas não há mais nada útil.`);
}

type TalkAction = Extract<PlayerAction, { type: "talk" }>;
const APPROACH_SKILL: Record<Exclude<TalkAction["approach"], "conversar">, string> = {
  persuadir: "diplomacia",
  intimidar: "intimidacao",
  enganar: "enganacao",
  intuir: "intuicao",
};

const firstName = (npc: NpcDef) => npc.name.split(" ")[0];

function talk(r: Resolution, a: TalkAction) {
  const npc = r.bp.npcs.find((n) => n.id === a.npcId);
  if (!npc) throw new ActionRejected("Essa pessoa não está na história.", "campaign.npc");
  const ns = r.state.npcs[npc.id];
  if (ns.state === "gone" || ns.state === "dead") throw new ActionRejected(`${npc.name} não está mais aqui.`, "campaign.npc");
  const { uninterrupted } = r.approach(npc.mapId, npc.objectId);
  if (!uninterrupted) return;
  ns.talked = true;
  r.events.push({ type: "npc_updated", npcId: npc.id });
  const exposed = !!r.state.flags[`exposto-${npc.id}`];
  const who = firstName(npc);

  if (a.approach === "intuir") {
    const roll = r.check(
      { skillId: "intuicao", dt: npc.persuasion.options.find((o) => o.skill === "intuicao")?.dt ?? 15, label: `Intuição: ler ${npc.name}` },
      `Perceber se ${who} está sendo sincero e o que esconde. Se falhar, você não consegue ler nada na expressão.`,
    );
    if (roll.outcome === "success") {
      if (npc.isCulprit) {
        r.state.flags[`exposto-${npc.id}`] = true;
        r.state.flags["culpado-exposto"] = true;
        r.fact(`Há algo errado em ${who}: as respostas são ensaiadas demais. Você percebe que está mentindo e escondendo algo grave: ${npc.secret}`, "discovery");
        r.remember("fact", `${npc.name} mente: ${npc.secret}`, "Intuição", npc.id);
      } else {
        r.fact(`${who} parece sincero. O que o incomoda de verdade: ${npc.secret}`, "discovery");
        r.remember("fact", `${npc.name} parece sincero; esconde apenas isto: ${npc.secret}`, "Intuição", npc.id);
      }
    } else r.fact(`${who} sustenta o seu olhar. Você não consegue decidir se está mentindo.`);
    return;
  }

  let cooperates = ns.cooperative || (ns.disposition >= 1 && !npc.isCulprit);
  let pushedAndFailed = false;
  if (!cooperates && a.approach !== "conversar") {
    const skill = APPROACH_SKILL[a.approach];
    const skillName = SKILL_BY_ID.get(skill)!.name;
    const stakes = {
      persuadir: `${who} não quer se envolver. Convencê-lo exige ${skillName}; se falhar, a conversa esfria.`,
      intimidar: `Pressionar ${who} até falar exige ${skillName}; se falhar, a pessoa se fecha e fica hostil.`,
      enganar: `Fazer ${who} acreditar na sua versão exige ${skillName}; se falhar, a mentira é percebida.`,
    }[a.approach];
    if (npc.isCulprit && !exposed) {
      // A culprit who has not been exposed only deflects; a failed push alerts them.
      const roll = r.check({ skillId: skill, dt: 25, label: `${skillName}: ${npc.name}` }, stakes);
      if (roll.outcome !== "success") {
        ns.disposition = Math.max(-3, ns.disposition - 1);
        r.addUrgency(1, `${npc.name} fica alerta`);
        pushedAndFailed = true;
      } else cooperates = true;
    } else {
      const option = npc.persuasion.options.find((o) => o.skill === skill);
      const dt = option?.dt ?? 20;
      const roll = r.check({ skillId: skill, dt, powers: a.powers as SkillPower[], label: `${skillName}: ${npc.name}` }, stakes);
      if (roll.outcome === "success") {
        cooperates = true;
        ns.disposition = Math.min(3, ns.disposition + (a.approach === "intimidar" ? -1 : 1));
      } else {
        ns.disposition = Math.max(-3, ns.disposition - 1);
        pushedAndFailed = true;
        if (a.approach === "enganar") r.fact(`${who} estreita os olhos: percebeu a mentira.`);
        if (a.approach === "intimidar") r.fact(`${who} não se deixa intimidar.`);
      }
    }
  }

  if (!cooperates) {
    r.fact(npc.deflection, "dialogue", npc.id);
    r.remember("statement", `${npc.name} se recusou a ajudar: "${npc.deflection}"`, npc.name, npc.id);
    if (a.approach === "conversar" && !pushedAndFailed) r.suggestions.push(`${npc.name} só coopera se convencido (${npc.persuasion.options.map((o) => SKILL_BY_ID.get(o.skill)!.name).join(", ")}).`);
    return;
  }
  ns.cooperative = true;
  const newClues = npc.knows.map((id) => r.bp.clues.find((c) => c.id === id)!).filter((c) => !r.state.clues[c.id].discovered);
  if (!newClues.length && (ns.gaveItem || !npc.gives)) r.fact(`${who} já contou tudo o que sabe e não tem mais nada a acrescentar.`);
  for (const c of newClues) r.discoverClue(c, npc.name);
  if (npc.gives && !ns.gaveItem) {
    ns.gaveItem = true;
    if (r.gainItem(npc.gives)) {
      const item = r.bp.items.find((i) => i.id === npc.gives)!;
      r.fact(`${who} entrega a você ${item.name.toLowerCase()}. ${item.description}`);
    }
  }
}

type SkillCheckAction = Extract<PlayerAction, { type: "skill_check" }>;

/** Improvised checks requested by the GM: recorded and narrated, but never change world state. */
function improvisedCheck(r: Resolution, a: SkillCheckAction) {
  if (!SKILL_BY_ID.has(a.skillId)) throw new ActionRejected(`Perícia desconhecida: ${a.skillId}`, "op-core.skills.list");
  if (!ALLOWED_DTS.includes(a.dt)) throw new ActionRejected(`DT ${a.dt} não está na tabela oficial de dificuldades.`, "op-core.test.difficulty-table");
  const skillName = SKILL_BY_ID.get(a.skillId)!.name;
  r.check({ skillId: a.skillId, dt: a.dt, powers: a.powers as SkillPower[], label: `${skillName}: ${a.reason}` }, a.stakes ?? `${a.reason}. O resultado decide se você consegue.`);
  r.fact("Teste improvisado: o resultado afeta apenas a narração, não o estado do mundo.", "mechanic");
}

function decide(r: Resolution, optionId: string) {
  const d = r.bp.decision;
  if (d.id in r.state.decisions) throw new ActionRejected("Essa decisão já foi tomada.", "campaign.decision");
  if (!evaluate(d.availableWhen, r.conditionContext())) throw new ActionRejected("Ainda não é possível decidir isso: a ameaça precisa ser vencida antes.", "campaign.decision");
  const option = d.options.find((o) => o.id === optionId);
  if (!option) throw new ActionRejected("Opção inválida.", "campaign.decision");
  if (option.requiresFlag && !r.state.flags[option.requiresFlag]) throw new ActionRejected("Você ainda não entende o suficiente para fazer isso com segurança.", "campaign.decision");
  const { uninterrupted } = r.approach(d.mapId, d.objectId);
  if (!uninterrupted) return;
  if (option.check) {
    const roll = r.check({ skillId: option.check.skill, dt: option.check.dt, label: option.label }, `${option.label} exige ${SKILL_BY_ID.get(option.check.skill)!.name}. Se falhar, o objeto reage e a urgência aumenta.`);
    if (roll.outcome !== "success") {
      r.fact("O procedimento falha. O objeto resiste e você precisa tentar de novo ou escolher outro caminho.");
      r.addUrgency(1, "o artefato reage");
      return;
    }
  }
  r.state.decisions[d.id] = option.id;
  for (const f of option.setsFlags) r.state.flags[f] = true;
  r.setObjectState(d.mapId, d.objectId, option.artifactState);
  r.events.push({ type: "decision_made", decisionId: d.id, optionId: option.id });
  r.fact(`Decisão: ${option.label}.`, "progress");
  r.remember("event", `Você decidiu: ${option.label}.`);
}

function firstAid(r: Resolution) {
  const kit = r.hasItem("kit-medicina") ? "kit-medicina" : r.hasItem("kit-improvisado") ? "kit-improvisado" : null;
  if (!kit) throw new ActionRejected("Você precisa de um kit de Medicina ou de material de primeiros socorros.", "op-core.medicine.first-aid");
  if (r.char.sceneUses.includes("primeiros-socorros")) throw new ActionRejected("Você já prestou primeiros socorros nesta cena.", "op-core.medicine.first-aid");
  const sheetMax = r.sheet.pvMax;
  if (r.char.pv >= sheetMax) throw new ActionRejected("Você não está ferido.", "op-core.medicine.first-aid");
  r.char.sceneUses.push("primeiros-socorros");
  const roll = r.check({ skillId: "medicina", dt: 15, label: "Primeiros socorros" }, `Tratar os próprios ferimentos exige Medicina. Se falhar, os curativos não seguram${kit === "kit-improvisado" ? " e o material é gasto" : ""}.`);
  if (kit === "kit-improvisado") {
    const item = r.char.inventory.find((i) => i.itemId === kit)!;
    item.quantity -= 1;
    r.char.inventory = r.char.inventory.filter((i) => i.quantity > 0);
  }
  if (roll.outcome !== "success") {
    r.fact("Os curativos não seguram e o sangue volta a escorrer.");
    return;
  }
  const heal = healRoll(r);
  const before = r.char.pv;
  r.char.pv = Math.min(sheetMax, r.char.pv + heal.total);
  if (before === 0 && r.char.pv > 0) r.char.dyingRounds = null;
  r.rolls.push({ label: "Cura: primeiros socorros", kind: "effect", expression: "1d8", dice: heal.dice, modifiers: [], total: heal.total, outcome: "none", notes: [] });
  r.events.push({ type: "resource", resource: "pv", delta: r.char.pv - before });
  r.fact(`Você recupera ${r.char.pv - before} PV (${r.char.pv}/${sheetMax}).`, "mechanic");
  r.fact("O curativo segura. A dor diminui o bastante para você seguir em frente.");
}

/** The 1d8 of first aid is the agent's own roll. */
export function healRoll(r: Resolution) {
  return r.playerRoll(
    { kind: "effect", label: "Cura: primeiros socorros", skillId: null, expression: "1d8", dice: { count: 1, sides: 8, keep: "sum" }, modifiers: [], extraDice: [], target: null, targetLabel: null, peCost: 0, stakes: "Quantos pontos de vida o curativo recupera." },
    (rng) => rollExpression(parseDice("1d8"), rng),
  );
}

function abandon(r: Resolution) {
  const enc = r.bp.encounters.find((e) => !(e.id in r.state.encountersResolved));
  if (!enc) throw new ActionRejected("Não há o que abandonar: a ameaça já foi resolvida.", "campaign.abandon");
  if (r.state.currentMapId !== r.bp.startMapId) throw new ActionRejected("Você precisa sair do local antes de abandonar a missão.", "campaign.abandon");
  r.state.encountersResolved[enc.id] = "fled";
  r.events.push({ type: "encounter_resolved", encounterId: enc.id, outcome: "fled" });
  r.fact("Você decide abandonar a investigação.");
  r.remember("event", "Você abandonou a investigação.");
}
