import { evaluate, type ConditionContext } from "@/modules/adventures/conditions";
import type { AdventureBlueprint, ClueDef, NpcDef } from "@/modules/adventures/schema";
import { parseDice, rollExpression, type RollRecord } from "@/modules/rules/core/dice";
import type { RandomSource } from "@/modules/rules/core/random";
import { ALLOWED_DTS, SKILL_BY_ID } from "@/modules/rules/systems/ordem-paranormal/data";
import type { OpCharacterBuild, OpCharacterState, OpSheet } from "@/modules/rules/systems/ordem-paranormal/character";
import { skillCheck, type SkillCheckRequest, type SkillPower } from "@/modules/rules/systems/ordem-paranormal/tests";
import { applyMapEvent, validateMapEvent, type MapRegistry } from "@/modules/world/events";
import { approachTile, doorsOnPath, findPath, isPresent } from "@/modules/world/grid";
import type { MapEvent, Position } from "@/modules/world/schema";
import type { PlayerAction } from "./actions";
import { combatAction, startEncounter } from "./encounter";
import type { CampaignState } from "./state";

export interface EngineContext {
  blueprint: AdventureBlueprint;
  state: CampaignState;
  character: { build: OpCharacterBuild; sheet: OpSheet; state: OpCharacterState };
  rng: RandomSource;
  /** Optional enemy tactic chosen by the GM; must be one of the threat's legal attacks. */
  enemyTactic?: string;
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
  /** Short hints for optional next actions. */
  suggestions: string[];
}

export type ActionResult = ActionOutcome | { ok: false; reason: string; ruleId?: string };

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
  facts: string[] = [];
  suggestions: string[] = [];
  readonly defs: MapRegistry;

  constructor(public ctx: EngineContext) {
    this.state = structuredClone(ctx.state);
    this.char = structuredClone(ctx.character.state);
    this.defs = Object.fromEntries(ctx.blueprint.maps.map((m) => [m.id, m]));
  }

  get bp() {
    return this.ctx.blueprint;
  }
  get sheet() {
    return this.ctx.character.sheet;
  }
  get rng() {
    return this.ctx.rng;
  }

  fact(text: string) {
    if (text) this.facts.push(text);
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
    this.fact(`Você gastou ${amount} PE (restam ${this.char.pe}).`);
  }

  check(req: SkillCheckRequest) {
    const result = skillCheck(this.sheet, this.char, req, this.rng);
    if (!result.ok) throw new ActionRejected(result.reason, result.ruleId);
    this.spendPe(result.peCost);
    this.char.sceneUses.push(...result.sceneUses);
    this.rolls.push(result.roll);
    const skill = SKILL_BY_ID.get(req.skillId)!;
    this.fact(`Teste de ${skill.name}: ${result.roll.total}${req.dt !== undefined ? ` contra DT ${req.dt}` : ""} — ${result.roll.outcome === "success" ? "sucesso" : result.roll.outcome === "failure" ? "falha" : "resultado registrado"}.`);
    return result.roll;
  }

  addUrgency(delta: number, reason: string) {
    if (delta <= 0) return;
    this.state.urgency = Math.min(this.bp.urgency.max, this.state.urgency + delta);
    this.events.push({ type: "urgency", delta, total: this.state.urgency });
    this.fact(`Urgência +${delta} (${this.state.urgency}/${this.bp.urgency.max}): ${reason}`);
    for (const eff of this.bp.urgency.effects) {
      if (eff.at <= this.state.urgency && !this.state.urgencyEffectsApplied.includes(eff.at)) {
        this.state.urgencyEffectsApplied.push(eff.at);
        this.state.flags[eff.flag] = true;
        this.fact(eff.text);
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
    this.fact(`Item obtido: ${item.name}. ${item.description}`);
    return true;
  }

  discoverClue(clue: ClueDef, by: string) {
    const entry = this.state.clues[clue.id];
    if (entry.discovered) return;
    entry.discovered = true;
    entry.discoveredBy = by;
    this.events.push({ type: "clue_discovered", clueId: clue.id });
    this.fact(`Pista descoberta — ${clue.title}: ${clue.description}`);
    if (clue.mapId && this.defs[clue.mapId].objects.some((o) => o.id === clue.objectId && o.kind === "clue")) {
      this.setObjectState(clue.mapId, clue.objectId, "found");
    }
    for (const objectId of clue.reveals.objects) {
      const mapId = this.bp.maps.find((m) => m.objects.some((o) => o.id === objectId))!.id;
      if (!this.state.maps[mapId].objects[objectId]?.revealed) {
        this.map({ type: "reveal_object", mapId, objectId });
        this.fact(`Algo novo foi revelado: ${this.defs[mapId].objects.find((o) => o.id === objectId)!.name}.`);
      }
    }
    for (const f of clue.reveals.flags) this.state.flags[f] = true;
  }

  conditionContext(): ConditionContext {
    return {
      flags: this.state.flags,
      clues: this.state.clues,
      decisions: this.state.decisions,
      encountersResolved: this.state.encountersResolved,
      urgency: this.state.urgency,
      visitedMaps: Object.values(this.state.maps).filter((m) => m.visited).map((m) => m.mapId),
      npcsTalked: Object.entries(this.state.npcs).filter(([, n]) => n.talked).map(([id]) => id),
    };
  }

  /** Moves along a validated path, firing area triggers on the way. Returns false if interrupted by an encounter. */
  walk(path: Position[]) {
    if (path.length < 2) return true;
    const mapId = this.state.currentMapId;
    for (const d of doorsOnPath(this.defs[mapId], this.state.maps[mapId], path)) {
      this.setObjectState(mapId, d.id, "open");
      this.fact(`Você abre ${d.name.toLowerCase()} no caminho.`);
    }
    for (let i = 1; i < path.length; i++) {
      const p = path[i];
      this.state.maps[mapId].player = p;
      if (this.areaTrigger(mapId, p)) {
        this.mapEvents.push({ type: "move_player", mapId, to: p });
        return false;
      }
    }
    this.mapEvents.push({ type: "move_player", mapId, to: path[path.length - 1] });
    return true;
  }

  private areaTrigger(mapId: string, p: Position) {
    for (const enc of this.bp.encounters) {
      if (enc.mapId !== mapId || enc.id in this.state.encountersResolved || this.state.encounter) continue;
      const area = this.defs[mapId].areas.find((a) => a.id === enc.triggerArea);
      if (area && p.x >= area.rect.x && p.x < area.rect.x + area.rect.w && p.y >= area.rect.y && p.y < area.rect.y + area.rect.h) {
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
    const path = approachTile(def, this.state.maps[mapId], this.state.maps[mapId].player, obj.position, { passClosedDoors: true });
    if (!path) throw new ActionRejected(`Não há caminho livre até ${obj.name}.`, "world.navigation");
    return { obj, uninterrupted: this.walk(path) };
  }

  finalize(): ActionOutcome {
    const ctx = () => this.conditionContext();
    for (const d of this.bp.derivedFlags) {
      if (!this.state.flags[d.flag] && evaluate(d.when, ctx())) {
        this.state.flags[d.flag] = true;
        if (d.flag === "conhece-fraqueza") this.fact(`Você entende a fraqueza da ameaça: ${this.bp.threats[0].weakness.description}`);
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
          this.fact(`Objetivo cumprido: ${o.text}.`);
        }
      }
      if (q.failWhen && evaluate(q.failWhen, ctx())) {
        qs.status = "failed";
        this.events.push({ type: "quest_updated", questId: q.id, status: "failed" });
        this.fact(`Missão falhou: ${q.title}.`);
      } else if (q.objectives.filter((o) => !o.optional).every((o) => qs.objectives[o.id])) {
        qs.status = "completed";
        this.events.push({ type: "quest_updated", questId: q.id, status: "completed" });
        this.fact(`Missão concluída: ${q.title}.`);
      }
    }
    if (!this.state.ending) {
      const ending = [...this.bp.endings].sort((a, b) => b.priority - a.priority).find((e) => evaluate(e.when, ctx()));
      if (ending) {
        this.state.ending = { id: ending.id, title: ending.title, tone: ending.tone, summary: ending.summary, rewards: ending.rewards };
        this.state.mode = "ended";
        this.state.encounter = null;
        this.events.push({ type: "ending", endingId: ending.id });
        this.fact(`FIM — ${ending.title}. ${ending.summary}`);
        if (!this.state.rewardsGranted) {
          this.state.rewardsGranted = true;
          if (ending.rewards.prestige || ending.rewards.nexGain) {
            this.fact(`Recompensas: +${ending.rewards.prestige} pontos de prestígio, +${ending.rewards.nexGain}% de NEX (registrado; a progressão de NEX ainda não está implementada). ${ending.rewards.note}`);
          } else this.fact(ending.rewards.note);
        }
      }
    }
    this.state.actionCount += 1;
    return { ok: true, state: this.state, characterState: this.char, rolls: this.rolls, events: this.events, mapEvents: this.mapEvents, facts: this.facts, suggestions: this.suggestions };
  }
}

/**
 * The authoritative action resolver. Pure given its RandomSource: same
 * context + action + dice ⇒ same outcome. Never mutates its inputs.
 */
export function resolveAction(ctx: EngineContext, action: PlayerAction): ActionResult {
  try {
    if (ctx.state.mode === "ended" && action.type !== "narrative") throw new ActionRejected("A missão já terminou.", "campaign.ended");
    const r = new Resolution(ctx);
    if (r.state.mode === "combat" && !["attack", "flee", "first_aid", "narrative"].includes(action.type)) {
      throw new ActionRejected("Em combate só é possível atacar, fugir, prestar primeiros socorros ou descrever a cena.", "op-core.combat.actions");
    }
    switch (action.type) {
      case "move":
        move(r, action.to);
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
        r.fact("Ação descritiva: nenhuma regra foi acionada e o estado do jogo não mudou.");
        break;
    }
    return r.finalize();
  } catch (e) {
    if (e instanceof ActionRejected) return { ok: false, reason: e.reason, ruleId: e.ruleId };
    throw e;
  }
}

function move(r: Resolution, to: Position) {
  const mapId = r.state.currentMapId;
  const def = r.defs[mapId];
  const path = findPath(def, r.state.maps[mapId], r.state.maps[mapId].player, to, { passClosedDoors: true });
  if (!path) throw new ActionRejected("Destino bloqueado ou inalcançável.", "world.navigation");
  r.walk(path);
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
      r.fact(`${obj.name}: ${obj.description}`);
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
        r.fact("Ao tocar o objeto, a presença que o guarda desperta.");
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
    r.fact(`${obj.name}: ${obj.description} Nada de útil aqui.`);
    return;
  }
  const entry = r.state.clues[clue.id];
  if (entry.discovered) {
    r.fact(`Você já examinou isto. ${clue.title}: ${clue.description}`);
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
    r.fact(`Você não tem o treinamento necessário para entender isto (${names}). Talvez alguém saiba explicar.`);
    return;
  }
  const roll = r.check({ skillId: method.skill, dt: method.dt, powers: a.powers as SkillPower[], searchingClues: true, label: `${SKILL_BY_ID.get(method.skill)!.name}: ${obj.name}` });
  entry.attempts += 1;
  if (roll.outcome === "success") {
    r.discoverClue(clue, SKILL_BY_ID.get(method.skill)!.name);
  } else {
    r.fact(clue.failure.text);
    if (r.state.maps[mapId].objects[objectId].state === "untouched") r.setObjectState(mapId, objectId, "searched");
    r.addUrgency(clue.failure.urgency, "o tempo passa enquanto você procura");
    const others = methods.filter((m) => m !== method).map((m) => SKILL_BY_ID.get(m.skill)!.name);
    if (others.length) r.suggestions.push(`Tentar outra abordagem: ${others.join(", ")}.`);
    const knower = r.bp.npcs.find((n) => n.knows.includes(clue.id));
    if (knower) r.suggestions.push(`Talvez ${knower.name} saiba algo sobre isso.`);
  }
}

function door(r: Resolution, mapId: string, objectId: string, verb: string, state: string) {
  const obj = r.defs[mapId].objects.find((o) => o.id === objectId)!;
  const lock = r.bp.locks.find((l) => l.objectId === objectId);
  switch (verb) {
    case "inspect":
      r.fact(`${obj.name}: ${state === "locked" ? "está trancada." : state === "open" ? "está aberta." : state === "broken" ? "foi arrombada." : "está fechada."}`);
      if (state === "locked") lockHints(r, lock);
      return;
    case "close":
      if (state !== "open") throw new ActionRejected(`${obj.name} não está aberta.`, "world.interaction");
      r.setObjectState(mapId, objectId, "closed");
      r.fact(`Você fecha ${obj.name.toLowerCase()}.`);
      return;
    case "open":
    case "enter":
      if (state === "locked") {
        r.fact(`${obj.name} está trancada.`);
        lockHints(r, lock);
        return;
      }
      if (state === "closed") {
        r.setObjectState(mapId, objectId, "open");
        r.fact(`Você abre ${obj.name.toLowerCase()}.`);
      }
      if (obj.kind === "exit" && (verb === "enter" || true) && obj.leadsTo) travel(r, mapId, obj.leadsTo);
      return;
    case "unlock": {
      if (state !== "locked") throw new ActionRejected(`${obj.name} não está trancada.`, "world.interaction");
      if (lock?.keyItem && r.hasItem(lock.keyItem)) {
        r.setObjectState(mapId, objectId, "closed");
        r.fact(`Você usa ${r.bp.items.find((i) => i.id === lock.keyItem)!.name.toLowerCase()} e destranca ${obj.name.toLowerCase()}.`);
        return;
      }
      if (!lock?.pick) throw new ActionRejected("Você não tem a chave e esta fechadura não pode ser aberta com ferramentas.", "world.interaction");
      const roll = r.check({ skillId: lock.pick.skill, dt: lock.pick.dt, label: `Abrir fechadura: ${obj.name}` });
      if (roll.outcome === "success") {
        r.setObjectState(mapId, objectId, "closed");
        r.fact("A fechadura cede com um clique.");
      } else {
        r.fact("A fechadura não cede.");
        r.addUrgency(1, "você perde tempo com a fechadura");
      }
      return;
    }
    case "force": {
      if (state !== "locked" && state !== "closed") throw new ActionRejected(`Não há por que arrombar ${obj.name.toLowerCase()}.`, "world.interaction");
      const force = lock?.force ?? { skill: "atletismo", dt: 10 };
      const bonus = r.hasItem("pe-de-cabra") ? [{ source: "Pé de cabra", value: 5 }] : [];
      const roll = r.check({ skillId: force.skill, dt: force.dt, situational: bonus, label: `Arrombar: ${obj.name}` });
      if (roll.outcome === "success") {
        r.setObjectState(mapId, objectId, state === "locked" ? "broken" : "open");
        r.fact(`${obj.name} cede com um estrondo.`);
      } else r.fact(`${obj.name} resiste.`);
      r.addUrgency(lock?.noiseUrgency ?? 1, "o barulho ecoa pelo lugar");
      return;
    }
  }
  throw new ActionRejected(`Ação "${verb}" não se aplica a portas.`, "world.interaction");
}

function lockHints(r: Resolution, lock: AdventureBlueprint["locks"][number] | undefined) {
  if (!lock) return;
  if (lock.keyItem) r.suggestions.push(r.hasItem(lock.keyItem) ? "Usar a chave que você carrega." : "Procurar quem tenha a chave.");
  if (lock.pick) r.suggestions.push(`Abrir a fechadura (${SKILL_BY_ID.get(lock.pick.skill)!.name}).`);
  if (lock.force) r.suggestions.push(`Arrombar (${SKILL_BY_ID.get(lock.force.skill)!.name}, faz barulho).`);
}

function travel(r: Resolution, fromMapId: string, to: { mapId: string; spawn: string }) {
  r.map({ type: "transition", fromMapId, toMapId: to.mapId, spawn: to.spawn });
  r.state.scene += 1;
  r.char.sceneUses = [];
  r.fact(`Você entra em: ${r.defs[to.mapId].name}.`);
}

function container(r: Resolution, mapId: string, objectId: string, verb: string, state: string) {
  const obj = r.defs[mapId].objects.find((o) => o.id === objectId)!;
  if (verb === "inspect") {
    r.fact(`${obj.name}: ${obj.description}`);
    return;
  }
  if (state === "closed") r.setObjectState(mapId, objectId, "open");
  const items = r.bp.items.filter((i) => i.objectId === objectId);
  if (r.objectState(mapId, objectId) === "open") r.setObjectState(mapId, objectId, "searched");
  const gained = items.filter((i) => r.gainItem(i.id));
  if (!gained.length) r.fact(`Você revira ${obj.name.toLowerCase()}, mas não há mais nada útil.`);
}

type TalkAction = Extract<PlayerAction, { type: "talk" }>;
const APPROACH_SKILL: Record<Exclude<TalkAction["approach"], "conversar">, string> = {
  persuadir: "diplomacia",
  intimidar: "intimidacao",
  enganar: "enganacao",
  intuir: "intuicao",
};

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

  if (a.approach === "intuir") {
    const roll = r.check({ skillId: "intuicao", dt: npc.persuasion.options.find((o) => o.skill === "intuicao")?.dt ?? 15, label: `Intuição: ler ${npc.name}` });
    if (roll.outcome === "success") {
      if (npc.isCulprit) {
        r.state.flags[`exposto-${npc.id}`] = true;
        r.state.flags["culpado-exposto"] = true;
        r.fact(`Você percebe que ${npc.name} está mentindo e esconde algo grave: ${npc.secret}`);
      } else r.fact(`${npc.name} parece sincero. O que o incomoda: ${npc.secret}`);
    } else r.fact(`${npc.name} é difícil de ler.`);
    return;
  }

  let cooperates = ns.cooperative || (ns.disposition >= 1 && !npc.isCulprit);
  if (!cooperates && a.approach !== "conversar") {
    const skill = APPROACH_SKILL[a.approach];
    if (npc.isCulprit && !exposed) {
      // A culprit who has not been exposed only deflects; a failed push alerts them.
      const roll = r.check({ skillId: skill, dt: 25, label: `${SKILL_BY_ID.get(skill)!.name}: ${npc.name}` });
      if (roll.outcome !== "success") {
        ns.disposition = Math.max(-3, ns.disposition - 1);
        r.addUrgency(1, `${npc.name} fica alerta`);
      } else cooperates = true;
    } else {
      const option = npc.persuasion.options.find((o) => o.skill === skill);
      const dt = option?.dt ?? 20;
      const roll = r.check({ skillId: skill, dt, powers: a.powers as SkillPower[], label: `${SKILL_BY_ID.get(skill)!.name}: ${npc.name}` });
      if (roll.outcome === "success") {
        cooperates = true;
        ns.disposition = Math.min(3, ns.disposition + (a.approach === "intimidar" ? -1 : 1));
      } else {
        ns.disposition = Math.max(-3, ns.disposition - 1);
        if (a.approach === "enganar") r.fact(`${npc.name} percebe a mentira.`);
      }
    }
  }

  if (!cooperates) {
    r.fact(`${npc.name} não coopera: "${npc.deflection}"`);
    if (a.approach === "conversar") r.suggestions.push(`Convencer ${npc.name} (Diplomacia), intimidar (Intimidação) ou ler suas intenções (Intuição).`);
    return;
  }
  ns.cooperative = true;
  const newClues = npc.knows.map((id) => r.bp.clues.find((c) => c.id === id)!).filter((c) => !r.state.clues[c.id].discovered);
  if (!newClues.length && (ns.gaveItem || !npc.gives)) r.fact(`${npc.name} já contou tudo o que sabe.`);
  for (const c of newClues) r.discoverClue(c, npc.name);
  if (npc.gives && !ns.gaveItem) {
    ns.gaveItem = true;
    if (r.gainItem(npc.gives)) r.fact(`${npc.name} entrega algo a você.`);
  }
}

type SkillCheckAction = Extract<PlayerAction, { type: "skill_check" }>;

/** Improvised checks requested by the GM: recorded and narrated, but never change world state. */
function improvisedCheck(r: Resolution, a: SkillCheckAction) {
  if (!SKILL_BY_ID.has(a.skillId)) throw new ActionRejected(`Perícia desconhecida: ${a.skillId}`, "op-core.skills.list");
  if (!ALLOWED_DTS.includes(a.dt)) throw new ActionRejected(`DT ${a.dt} não está na tabela oficial de dificuldades.`, "op-core.test.difficulty-table");
  r.check({ skillId: a.skillId, dt: a.dt, powers: a.powers as SkillPower[], label: `${SKILL_BY_ID.get(a.skillId)!.name}: ${a.reason}` });
  r.fact("Teste improvisado: o resultado afeta apenas a narração, não o estado do mundo.");
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
    const roll = r.check({ skillId: option.check.skill, dt: option.check.dt, label: option.label });
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
  r.fact(`Decisão: ${option.label}.`);
}

function firstAid(r: Resolution) {
  const kit = r.hasItem("kit-medicina") ? "kit-medicina" : r.hasItem("kit-improvisado") ? "kit-improvisado" : null;
  if (!kit) throw new ActionRejected("Você precisa de um kit de Medicina ou de material de primeiros socorros.", "op-core.medicine.first-aid");
  if (r.char.sceneUses.includes("primeiros-socorros")) throw new ActionRejected("Você já prestou primeiros socorros nesta cena.", "op-core.medicine.first-aid");
  const sheetMax = r.sheet.pvMax;
  if (r.char.pv >= sheetMax) throw new ActionRejected("Você não está ferido.", "op-core.medicine.first-aid");
  r.char.sceneUses.push("primeiros-socorros");
  const roll = r.check({ skillId: "medicina", dt: 15, label: "Primeiros socorros" });
  if (kit === "kit-improvisado") {
    const item = r.char.inventory.find((i) => i.itemId === kit)!;
    item.quantity -= 1;
    r.char.inventory = r.char.inventory.filter((i) => i.quantity > 0);
  }
  if (roll.outcome !== "success") {
    r.fact("Os curativos não seguram.");
    return;
  }
  const heal = rollExpression(parseDice("1d8"), r.rng);
  const before = r.char.pv;
  r.char.pv = Math.min(sheetMax, r.char.pv + heal.total);
  if (before === 0 && r.char.pv > 0) r.char.dyingRounds = null;
  r.rolls.push({ label: "Cura: primeiros socorros", kind: "effect", expression: "1d8", dice: heal.dice, modifiers: [], total: heal.total, outcome: "none", notes: [] });
  r.events.push({ type: "resource", resource: "pv", delta: r.char.pv - before });
  r.fact(`Você recupera ${r.char.pv - before} PV (${r.char.pv}/${sheetMax}).`);
}

function abandon(r: Resolution) {
  const enc = r.bp.encounters.find((e) => !(e.id in r.state.encountersResolved));
  if (!enc) throw new ActionRejected("Não há o que abandonar: a ameaça já foi resolvida.", "campaign.abandon");
  if (r.state.currentMapId !== r.bp.startMapId) throw new ActionRejected("Você precisa sair do local antes de abandonar a missão.", "campaign.abandon");
  r.state.encountersResolved[enc.id] = "fled";
  r.events.push({ type: "encounter_resolved", encounterId: enc.id, outcome: "fled" });
  r.fact("Você decide abandonar a investigação.");
}
