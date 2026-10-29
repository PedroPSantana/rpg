import { applyMentalDamage, applyPhysicalDamage, DYING_ROUNDS_TO_DEATH, resolveAttack, rollInitiative, type Attack } from "@/modules/rules/systems/ordem-paranormal/combat";
import { parseDice, rollExpression } from "@/modules/rules/core/dice";
import { SKILL_BY_ID } from "@/modules/rules/systems/ordem-paranormal/data";
import type { PlayerAction } from "./actions";
import { ActionRejected, type Resolution } from "./engine";

/** op-core.combat.initiative + op-core.threat.presenca-perturbadora */
export function startEncounter(r: Resolution, encounterId: string) {
  const enc = r.bp.encounters.find((e) => e.id === encounterId)!;
  const threat = r.bp.threats.find((t) => t.id === enc.threatId)!;
  r.state.mode = "combat";
  const threatObj = r.defs[enc.mapId].objects.find((o) => o.id === enc.objectId);
  if (threatObj && r.objectState(enc.mapId, enc.objectId) !== "active") r.setObjectState(enc.mapId, enc.objectId, "active");
  r.events.push({ type: "encounter_started", encounterId });
  r.fact(`Combate! ${threat.name}: ${enc.intro}`);

  const firstTime = r.state.threatPv[threat.id] === threat.pv;
  r.state.encounter = {
    id: enc.id,
    threatId: threat.id,
    round: 1,
    order: [],
    turnIndex: 0,
    threat: { pv: r.state.threatPv[threat.id], pvMax: threat.pv, status: "active" },
    presenceResolved: false,
    log: [],
  };

  if (threat.disturbingPresence && firstTime) {
    const dp = threat.disturbingPresence;
    const roll = r.check({ skillId: "vontade", dt: dp.dt, label: `Vontade: presença perturbadora de ${threat.name}` });
    if (roll.outcome !== "success") {
      const dmg = rollExpression(parseDice(dp.sanDamage), r.rng);
      r.rolls.push({ label: "Dano mental: presença perturbadora", kind: "damage", expression: dp.sanDamage, dice: dmg.dice, modifiers: [], total: dmg.total, outcome: "none", notes: [] });
      sanityDamage(r, dmg.total, "a presença da criatura");
    } else r.fact("Você mantém a mente firme diante da criatura.");
  }
  r.state.encounter.presenceResolved = true;
  if (r.state.flags["personagem-caido"]) return;

  const order = rollInitiative(
    [
      { id: "pc", name: "Você", agility: r.sheet.attributes.AGI, initiativeBonus: r.sheet.skills.find((s) => s.id === "iniciativa")!.bonus },
      { id: threat.id, name: threat.name, agility: threat.agility, initiativeBonus: threat.initiativeBonus },
    ],
    r.rng,
  );
  for (const o of order) r.rolls.push(o.roll);
  r.state.encounter.order = order.map((o) => ({ id: o.entrant.id, kind: o.entrant.id === "pc" ? ("pc" as const) : ("threat" as const), name: o.entrant.name, initiative: o.roll.total }));
  r.fact(`Iniciativa: ${r.state.encounter.order.map((o) => `${o.name} ${o.initiative}`).join(", ")}.`);
  if (r.state.encounter.order[0].kind === "threat") threatTurn(r);
  if (r.state.encounter) log(r, `Rodada ${r.state.encounter.round}: sua vez.`);
}

type CombatPlayerAction = Extract<PlayerAction, { type: "attack" | "flee" | "first_aid" }>;

export function combatAction(r: Resolution, a: CombatPlayerAction) {
  const enc = r.state.encounter;
  if (r.state.mode !== "combat" || !enc) throw new ActionRejected("Não há combate em andamento.", "op-core.combat.actions");
  const threat = r.bp.threats.find((t) => t.id === enc.threatId)!;

  if (a.type === "attack") {
    const profile = r.sheet.attacks.find((x) => x.weaponId === a.weaponId);
    if (!profile) throw new ActionRejected("Você não tem essa arma.", "op-core.equipment");
    if (a.weaponId !== "desarmado" && !r.hasItem(a.weaponId)) throw new ActionRejected("Essa arma não está no seu inventário.", "op-core.equipment");
    const skill = r.sheet.skills.find((s) => s.id === profile.skill)!;
    const attack: Attack = {
      id: profile.weaponId,
      name: profile.name,
      attackDice: r.sheet.attributes[SKILL_BY_ID.get(profile.skill)!.attribute],
      attackBonus: skill.bonus,
      damage: profile.damage,
      damageBonus: profile.damageBonus,
      critThreshold: profile.critThreshold,
      critMultiplier: profile.critMultiplier,
      damageKind: "physical",
    };
    const attackModifiers: { source: string; value: number }[] = [];
    const damageModifiers: { source: string; value: number }[] = [];
    if (a.special !== "none") {
      if (!r.sheet.abilities.some((x) => x.id === "ataque-especial")) throw new ActionRejected("Você não possui Ataque Especial.", "op-core.ability.ataque-especial");
      r.spendPe(2);
      (a.special === "ataque" ? attackModifiers : damageModifiers).push({ source: "Ataque Especial", value: 5 });
    }
    const weak = !!r.state.flags[threat.weakness.flag];
    const defense = threat.defense - (weak ? threat.weakness.defensePenalty : 0);
    const res = resolveAttack(attack, defense, r.rng, { attackModifiers, damageModifiers, damageResistance: weak && threat.weakness.ignoresResistance ? 0 : threat.damageResistance });
    r.rolls.push(res.attackRoll);
    if (res.damageRoll) r.rolls.push(res.damageRoll);
    if (weak) r.fact(`Explorando a fraqueza: Defesa da criatura ${defense} e sem resistência a dano.`);
    if (!res.hit) {
      r.fact(`Ataque com ${profile.name}: ${res.attackRoll.total} contra Defesa ${defense} — errou.`);
      log(r, `Você erra (${res.attackRoll.total} vs ${defense}).`);
    } else {
      enc.threat.pv = Math.max(0, enc.threat.pv - res.damage);
      r.state.threatPv[threat.id] = enc.threat.pv;
      r.fact(`Ataque com ${profile.name}: ${res.attackRoll.total} contra Defesa ${defense} — ${res.critical ? "ACERTO CRÍTICO" : "acertou"}, ${res.damage} de dano (${threat.name}: ${enc.threat.pv}/${enc.threat.pvMax} PV).`);
      log(r, `Você causa ${res.damage} de dano${res.critical ? " (crítico)" : ""}.`);
      if (enc.threat.pv === 0) return victory(r);
    }
  } else if (a.type === "flee") {
    const roll = r.check({ skillId: a.skillId, dt: threat.fleeDt, label: `Fuga: ${SKILL_BY_ID.get(a.skillId)!.name}` });
    if (roll.outcome === "success") return fled(r);
    r.fact("Você não consegue escapar.");
    log(r, "Tentativa de fuga falhou.");
  } else {
    firstAidInCombat(r);
  }

  threatTurn(r);
  if (r.state.encounter) {
    r.state.encounter.round += 1;
    log(r, `Rodada ${r.state.encounter.round}: sua vez.`);
  }
}

function firstAidInCombat(r: Resolution) {
  const kit = r.hasItem("kit-medicina") || r.hasItem("kit-improvisado");
  if (!kit) throw new ActionRejected("Você precisa de um kit de Medicina ou de material de primeiros socorros.", "op-core.medicine.first-aid");
  if (r.char.sceneUses.includes("primeiros-socorros")) throw new ActionRejected("Você já prestou primeiros socorros nesta cena.", "op-core.medicine.first-aid");
  if (r.char.pv >= r.sheet.pvMax) throw new ActionRejected("Você não está ferido.", "op-core.medicine.first-aid");
  r.char.sceneUses.push("primeiros-socorros");
  const roll = r.check({ skillId: "medicina", dt: 15, label: "Primeiros socorros em combate" });
  if (roll.outcome === "success") {
    const heal = rollExpression(parseDice("1d8"), r.rng);
    const before = r.char.pv;
    r.char.pv = Math.min(r.sheet.pvMax, r.char.pv + heal.total);
    r.rolls.push({ label: "Cura: primeiros socorros", kind: "effect", expression: "1d8", dice: heal.dice, modifiers: [], total: heal.total, outcome: "none", notes: [] });
    r.fact(`Você recupera ${r.char.pv - before} PV.`);
    log(r, `Você se cura em ${r.char.pv - before} PV.`);
  } else r.fact("Os curativos não seguram.");
}

/** The threat acts with one of its legal attacks — never anything outside its stat block. */
export function threatTurn(r: Resolution) {
  const enc = r.state.encounter!;
  const threat = r.bp.threats.find((t) => t.id === enc.threatId)!;
  let attack = threat.attacks.find((x) => x.id === r.ctx.enemyTactic);
  if (!attack) {
    const pvRatio = r.char.pv / r.sheet.pvMax;
    const sanRatio = r.char.san / r.sheet.sanMax;
    const mental = threat.attacks.find((x) => x.damageKind === "mental");
    const physical = threat.attacks.find((x) => x.damageKind === "physical") ?? threat.attacks[0];
    // Default tactic: press whichever resource is proportionally lower.
    attack = mental && sanRatio < pvRatio ? mental : physical;
  }
  const res = resolveAttack(attack, r.sheet.defense, r.rng);
  r.rolls.push(res.attackRoll);
  if (res.damageRoll) r.rolls.push(res.damageRoll);
  if (!res.hit) {
    r.fact(`${threat.name} usa ${attack.name}: ${res.attackRoll.total} contra sua Defesa ${r.sheet.defense} — errou.`);
    log(r, `${threat.name} erra.`);
    return;
  }
  r.fact(`${threat.name} usa ${attack.name}: ${res.attackRoll.total} contra sua Defesa ${r.sheet.defense} — ${res.critical ? "CRÍTICO" : "acertou"}.`);
  if (attack.damageKind === "mental") sanityDamage(r, res.damage, attack.name);
  else {
    const before = r.char.pv;
    const out = applyPhysicalDamage(r.char.pv, res.damage);
    r.char.pv = out.pv;
    r.events.push({ type: "resource", resource: "pv", delta: out.pv - before });
    r.fact(`Você sofre ${res.damage} de dano (${r.char.pv}/${r.sheet.pvMax} PV).`);
    log(r, `${threat.name} causa ${res.damage} de dano.`);
    if (out.droppedToZero) dying(r);
  }
}

function sanityDamage(r: Resolution, amount: number, source: string) {
  const before = r.char.san;
  const out = applyMentalDamage(r.char.san, amount, r.sheet.mentalResistance);
  r.char.san = out.san;
  r.events.push({ type: "resource", resource: "san", delta: out.san - before });
  r.fact(`Dano mental (${source}): −${out.effective} SAN${r.sheet.mentalResistance ? ` (resistência ${r.sheet.mentalResistance})` : ""} (${r.char.san}/${r.sheet.sanMax}).`);
  if (r.state.encounter) log(r, `Você perde ${out.effective} SAN.`);
  if (out.insane) {
    r.char.conditions.push({ id: "enlouquecendo", source });
    r.fact("Sua Sanidade chega a 0: você está enlouquecendo.");
    downed(r);
  }
}

/** op-core.conditions.morrendo — a solo agent with no allies cannot be stabilized while unconscious. */
function dying(r: Resolution) {
  r.char.conditions.push({ id: "morrendo", source: "0 PV" });
  r.char.dyingRounds = 0;
  r.fact("Você cai com 0 PV e está morrendo.");
  for (let i = 1; i <= DYING_ROUNDS_TO_DEATH; i++) {
    r.char.dyingRounds = i;
    r.fact(i < DYING_ROUNDS_TO_DEATH ? `Turno ${i} morrendo: ninguém pode ajudar.` : `Você inicia o ${i}º turno morrendo e não resiste.`);
  }
  downed(r);
}

function downed(r: Resolution) {
  r.state.flags["personagem-caido"] = true;
  if (r.state.encounter) {
    r.state.encountersResolved[r.state.encounter.id] = "defeat";
    r.events.push({ type: "encounter_resolved", encounterId: r.state.encounter.id, outcome: "defeat" });
  }
  r.state.encounter = null;
}

function victory(r: Resolution) {
  const enc = r.state.encounter!;
  const def = r.bp.encounters.find((e) => e.id === enc.id)!;
  const threat = r.bp.threats.find((t) => t.id === enc.threatId)!;
  r.state.encountersResolved[enc.id] = "victory";
  r.events.push({ type: "encounter_resolved", encounterId: enc.id, outcome: "victory" });
  r.setObjectState(def.mapId, def.objectId, "defeated");
  r.state.encounter = null;
  r.state.mode = "exploration";
  r.char.sceneUses = [];
  r.fact(`${threat.name} foi derrotado.`);
  if (!r.state.flags["vitima-perdida"]) r.state.flags["vitima-salva"] = true;
}

function fled(r: Resolution) {
  const enc = r.state.encounter!;
  const def = r.bp.encounters.find((e) => e.id === enc.id)!;
  r.setObjectState(def.mapId, def.objectId, "fled");
  r.state.encounter = null;
  r.state.mode = "exploration";
  // Retreat to the entrance of the current map (outside any trigger area).
  const map = r.defs[r.state.currentMapId];
  r.state.maps[map.id].player = map.spawns.exit ?? map.spawns.start;
  r.mapEvents.push({ type: "move_player", mapId: map.id, to: r.state.maps[map.id].player });
  r.fact("Você escapa por enquanto. A criatura continua lá, ferida ou não.");
  r.state.flags["ameaca-cacando"] = false;
  r.addUrgency(2, "a criatura agora sabe de você");
  r.state.flags["ameaca-cacando"] = false;
}

function log(r: Resolution, line: string) {
  r.state.encounter?.log.push(line);
}
