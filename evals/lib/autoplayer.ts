import type { AdventureBlueprint } from "@/modules/adventures/schema";
import type { PlayerAction } from "@/modules/campaign/actions";
import { resolveAction, type EngineContext } from "@/modules/campaign/engine";
import { initialCampaignState, type CampaignState } from "@/modules/campaign/state";
import type { RandomSource } from "@/modules/rules/core/random";
import { deriveSheet, initialState, type OpCharacterBuild } from "@/modules/rules/systems/ordem-paranormal/character";
import { isPresent } from "@/modules/world/grid";

export interface AutoplayResult {
  endingId: string | null;
  tone: string | null;
  actions: number;
  rejected: number;
  cluesFound: number;
  urgency: number;
  died: boolean;
  fled: boolean;
  finalPv: number;
  finalSan: number;
  state: CampaignState;
  log: string[];
}

export interface AutoplayOptions {
  /** Flee when PV drops below this fraction of the maximum. 0 = never flee. */
  fleeBelow?: number;
  maxActions?: number;
}

/**
 * A simple scripted investigator used by the evaluation suite. It only uses
 * information a player could see on screen (map objects, journal state) and
 * plays through the deterministic engine, like a real session would.
 */
export function autoplay(blueprint: AdventureBlueprint, build: OpCharacterBuild, rng: RandomSource, opts: AutoplayOptions = {}): AutoplayResult {
  const sheet = deriveSheet(build);
  let ctx: EngineContext = { blueprint, state: initialCampaignState(blueprint), character: { build, sheet, state: initialState(build, sheet) }, rng };
  const tries = new Map<string, number>();
  const log: string[] = [];
  let actions = 0;
  let rejected = 0;
  const max = opts.maxActions ?? 250;

  const attempt = (key: string, action: PlayerAction) => {
    tries.set(key, (tries.get(key) ?? 0) + 1);
    actions++;
    const out = resolveAction(ctx, action);
    if (!out.ok) {
      rejected++;
      log.push(`✗ ${action.type} ${key}: ${out.reason}`);
      return false;
    }
    ctx = { ...ctx, state: out.state, character: { ...ctx.character, state: out.characterState } };
    log.push(`✓ ${action.type} ${key} [PV ${out.characterState.pv} SAN ${out.characterState.san} urg ${out.state.urgency} ${out.state.mode}]`);
    return true;
  };
  const tried = (key: string) => tries.get(key) ?? 0;
  let everFled = false;
  // Flee with whichever of Atletismo/Acrobacia rolls more dice (then higher bonus).
  const fleeSkill = (["atletismo", "acrobacia"] as const)
    .map((id) => ({ id, s: sheet.skills.find((x) => x.id === id)! }))
    .sort((a, b) => sheet.attributes[b.s.attribute] - sheet.attributes[a.s.attribute] || b.s.bonus - a.s.bonus)[0].id;

  while (ctx.state.mode !== "ended" && actions < max) {
    const st = ctx.state;
    if (st.mode === "combat") {
      const pv = ctx.character.state.pv;
      if (opts.fleeBelow && pv > 0 && pv < sheet.pvMax * opts.fleeBelow) {
        if (attempt("flee", { type: "flee", skillId: fleeSkill }) && ctx.state.mode === "exploration") everFled = true;
        continue;
      }
      const best = [...sheet.attacks].sort((a, b) => Number(b.proficient) - Number(a.proficient) || avg(b.damage) - avg(a.damage))[0];
      const special = sheet.abilities.some((a) => a.id === "ataque-especial") && ctx.character.state.pe >= 2 ? "ataque" : "none";
      attempt("attack", { type: "attack", weaponId: best.weaponId, special });
      continue;
    }
    if (st.encountersResolved[blueprint.encounters[0]?.id] === "victory" && !(blueprint.decision.id in st.decisions)) {
      const seal = blueprint.decision.options.find((o) => o.id === "selar");
      const pick = seal?.requiresFlag && st.flags[seal.requiresFlag] && tried("decide:selar") === 0 ? "selar" : "destruir";
      attempt(`decide:${pick}`, { type: "decide", optionId: pick });
      continue;
    }

    const mapId = st.currentMapId;
    const def = blueprint.maps.find((m) => m.id === mapId)!;
    const ms = st.maps[mapId];
    const present = def.objects.filter((o) => isPresent(def, ms, o.id));
    const objState = (id: string) => ms.objects[id]?.state;
    const next = nextExploration();
    if (!next) break;
    attempt(next.key, next.action);

    function nextExploration(): { key: string; action: PlayerAction } | null {
      // A cautious investigator who already had to run does not go back in.
      // A cautious player also avoids the creature until they know its weakness, unless built to fight.
      const weak = blueprint.threats.some((t) => st.flags[t.weakness.flag]);
      const avoidFight = !!opts.fleeBelow && (everFled || (!weak && sheet.pvMax < 20));
      for (const clue of blueprint.clues.filter((c) => c.mapId === mapId && !st.clues[c.id].discovered)) {
        // Testimony clues sit on an NPC and come from talking, not searching.
        if (!present.some((o) => o.id === clue.objectId && o.kind !== "npc")) continue;
        const key = `search:${clue.objectId}`;
        if (tried(key) < 3) return { key, action: { type: "interact", objectId: clue.objectId, verb: "search", powers: [] } };
      }
      for (const npc of blueprint.npcs.filter((n) => n.mapId === mapId)) {
        const ns = st.npcs[npc.id];
        if (ns.state === "gone" || ns.state === "dead" || ns.cooperative) continue;
        for (const approach of ["conversar", "persuadir", "intuir", "intimidar"] as const) {
          const key = `talk:${npc.id}:${approach}`;
          if (tried(key) < 1) return { key, action: { type: "talk", npcId: npc.id, approach, powers: [] } };
        }
      }
      for (const o of present.filter((x) => x.kind === "container" && objState(x.id) !== "searched")) {
        const key = `container:${o.id}`;
        if (tried(key) < 2) return { key, action: { type: "interact", objectId: o.id, verb: objState(o.id) === "open" ? "search" : "open", powers: [] } };
      }
      for (const o of present.filter((x) => x.kind === "item" && objState(x.id) === "present")) {
        const key = `take:${o.id}`;
        if (tried(key) < 1) return { key, action: { type: "interact", objectId: o.id, verb: "take", powers: [] } };
      }
      for (const o of present.filter((x) => x.kind === "door" && objState(x.id) !== "open" && objState(x.id) !== "broken")) {
        const s = objState(o.id);
        const verb = s === "locked" ? (tried(`unlock:${o.id}`) < 1 ? "unlock" : "force") : "open";
        const key = `${verb}:${o.id}`;
        if (tried(key) < 3) return { key, action: { type: "interact", objectId: o.id, verb, powers: [] } };
      }
      if (opts.fleeBelow && ctx.character.state.pv < sheet.pvMax * 0.6 && tried(`aid:${st.scene}`) < 1) {
        return { key: `aid:${st.scene}`, action: { type: "first_aid" } };
      }
      const artifact = avoidFight ? undefined : present.find((x) => x.kind === "artifact");
      if (artifact && tried(`use:${artifact.id}`) < 2) return { key: `use:${artifact.id}`, action: { type: "interact", objectId: artifact.id, verb: "inspect", powers: [] } };
      const exit = present.find((x) => x.kind === "exit");
      if (exit && mapId === blueprint.startMapId && !(opts.fleeBelow && everFled)) {
        const s = objState(exit.id);
        if (s === "locked") {
          const verb = tried(`unlock:${exit.id}`) < 1 ? "unlock" : "force";
          if (tried(`${verb}:${exit.id}`) < 4) return { key: `${verb}:${exit.id}`, action: { type: "interact", objectId: exit.id, verb, powers: [] } };
        } else if (tried(`enter:${exit.id}`) < 3) return { key: `enter:${exit.id}`, action: { type: "interact", objectId: exit.id, verb: "enter", powers: [] } };
      }
      if (mapId !== blueprint.startMapId) {
        // Leave the location before giving up: abandoning requires being outside.
        const out = present.find((x) => x.kind === "exit");
        if (out && tried(`leave:${out.id}`) < 2) return { key: `leave:${out.id}`, action: { type: "interact", objectId: out.id, verb: "enter", powers: [] } };
      }
      if (tried("abandon") < 1) return { key: "abandon", action: { type: "abandon" } };
      return null;
    }
  }

  const ending = ctx.state.ending;
  return {
    endingId: ending?.id ?? null,
    tone: ending?.tone ?? null,
    actions,
    rejected,
    cluesFound: Object.values(ctx.state.clues).filter((c) => c.discovered).length,
    urgency: ctx.state.urgency,
    died: ending?.id === "derrota",
    fled: Object.values(ctx.state.encountersResolved).includes("fled"),
    finalPv: ctx.character.state.pv,
    finalSan: ctx.character.state.san,
    state: ctx.state,
    log,
  };
}

function avg(expr: string) {
  const m = /^(\d+)d(\d+)/.exec(expr);
  return m ? (Number(m[1]) * (Number(m[2]) + 1)) / 2 : 0;
}
