import { lowerName } from "./text";
import { applyMentalDamage, applyPhysicalDamage, DYING_ROUNDS_TO_DEATH, resolveAttack, rollAttack, rollDamage, rollInitiativeOf, sortInitiative, type Attack } from "@/modules/rules/systems/ordem-paranormal/combat";
import { parseDice, rollExpression } from "@/modules/rules/core/dice";
import { SKILL_BY_ID } from "@/modules/rules/systems/ordem-paranormal/data";
import type { PlayerAction } from "./actions";
import { ActionRejected, healRoll, type Resolution } from "./engine";

/** op-core.combat.initiative + op-core.threat.presenca-perturbadora */
export function startEncounter(r: Resolution, encounterId: string) {
  const enc = r.bp.encounters.find((e) => e.id === encounterId)!;
  const threat = r.bp.threats.find((t) => t.id === enc.threatId)!;
  r.state.mode = "combat";
  const threatObj = r.defs[enc.mapId].objects.find((o) => o.id === enc.objectId);
  if (threatObj && r.objectState(enc.mapId, enc.objectId) !== "active") r.setObjectState(enc.mapId, enc.objectId, "active");
  r.events.push({ type: "encounter_started", encounterId });
  r.fact(enc.intro, "danger");
  r.fact(`Combate contra ${threat.name}.`, "progress");
  r.remember("event", `Você enfrentou ${threat.name}: ${threat.description}`);

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
    const roll = r.check(
      { skillId: "vontade", dt: dp.dt, label: `Vontade: presença perturbadora de ${threat.name}` },
      `Olhar para ${threat.name} agride a mente. Resistir exige Vontade; se falhar, você perde Sanidade (${dp.sanDamage}).`,
    );
    if (roll.outcome !== "success") {
      const dmg = rollExpression(parseDice(dp.sanDamage), r.rng);
      r.rolls.push({ label: "Dano mental: presença perturbadora", kind: "damage", expression: dp.sanDamage, dice: dmg.dice, modifiers: [], total: dmg.total, outcome: "none", notes: [] });
      sanityDamage(r, dmg.total, "a presença da criatura");
    } else r.fact("Você mantém a mente firme diante da criatura.");
  }
  r.state.encounter.presenceResolved = true;
  if (r.state.flags["personagem-caido"]) return;

  const pc = rollInitiativeOfPlayer(r);
  const foe = rollInitiativeOf({ id: threat.id, name: threat.name, agility: threat.agility, initiativeBonus: threat.initiativeBonus }, r.rng);
  const order = sortInitiative([pc, foe]);
  for (const o of [pc, foe]) r.rolls.push(o.roll);
  r.state.encounter.order = order.map((o) => ({ id: o.entrant.id, kind: o.entrant.id === "pc" ? ("pc" as const) : ("threat" as const), name: o.entrant.name, initiative: o.roll.total }));
  r.fact(`Iniciativa: ${r.state.encounter.order.map((o) => `${o.name} ${o.initiative}`).join(", ")}.`, "mechanic");
  if (r.state.encounter.order[0].kind === "threat") threatTurn(r);
  if (r.state.encounter) log(r, `Rodada ${r.state.encounter.round}: sua vez.`);
}

function rollInitiativeOfPlayer(r: Resolution) {
  const entrant = { id: "pc", name: "Você", agility: r.sheet.attributes.AGI, initiativeBonus: r.sheet.skills.find((s) => s.id === "iniciativa")!.bonus };
  const n = entrant.agility;
  return r.playerRoll(
    {
      kind: "initiative",
      label: "Iniciativa",
      skillId: "iniciativa",
      expression: `${n >= 1 ? n : 2 - n}d20 (${n >= 1 ? "maior" : "menor"})`,
      dice: { count: n >= 1 ? n : 2 - n, sides: 20, keep: n >= 1 ? "highest" : "lowest" },
      modifiers: entrant.initiativeBonus ? [{ source: "Iniciativa", value: entrant.initiativeBonus }] : [],
      extraDice: [],
      target: null,
      targetLabel: null,
      peCost: 0,
      stakes: "Quem age primeiro no confronto.",
    },
    (rng) => rollInitiativeOf(entrant, rng),
  );
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
      if (r.char.pe < 2) throw new ActionRejected(`PE insuficientes (precisa de 2, tem ${r.char.pe}).`, "op-core.resources.pe");
      (a.special === "ataque" ? attackModifiers : damageModifiers).push({ source: "Ataque Especial", value: 5 });
    }
    const weak = !!r.state.flags[threat.weakness.flag];
    const defense = threat.defense - (weak ? threat.weakness.defensePenalty : 0);
    const options = { attackModifiers, damageModifiers, damageResistance: weak && threat.weakness.ignoresResistance ? 0 : threat.damageResistance };
    const n = attack.attackDice;
    const hitRoll = r.playerRoll(
      {
        kind: "test",
        label: `Ataque: ${profile.name}`,
        skillId: profile.skill,
        expression: `${n >= 1 ? n : 2 - n}d20 (${n >= 1 ? "maior" : "menor"})`,
        dice: { count: n >= 1 ? n : 2 - n, sides: 20, keep: n >= 1 ? "highest" : "lowest" },
        modifiers: [{ source: "Perícia de ataque", value: attack.attackBonus }, ...attackModifiers].filter((m) => m.value !== 0),
        extraDice: [],
        target: defense,
        targetLabel: "Defesa",
        peCost: a.special !== "none" ? 2 : 0,
        stakes: `Acertar ${threat.name} com ${lowerName(profile.name)}. Se errar, a criatura age sem ter sofrido nada.`,
      },
      (rng) => rollAttack(attack, defense, rng, options),
    );
    if (a.special !== "none") r.spendPe(2);
    r.rolls.push(hitRoll.attackRoll);
    r.tally(hitRoll.hit ? "success" : "failure");
    if (weak) r.fact(`Explorando a fraqueza: Defesa da criatura ${defense} e sem resistência a dano.`, "mechanic");
    if (!hitRoll.hit) {
      r.fact(`Ataque com ${profile.name}: ${hitRoll.attackRoll.total} contra Defesa ${defense} — errou.`, "mechanic");
      log(r, `Você erra (${hitRoll.attackRoll.total} vs ${defense}).`);
    } else {
      const crit = hitRoll.critical;
      const dmg = r.playerRoll(
        {
          kind: "damage",
          label: `Dano: ${profile.name}`,
          skillId: null,
          expression: crit ? `${profile.damage} ×${attack.critMultiplier} (crítico)` : profile.damage,
          dice: { count: parseDice(attack.damage).terms.reduce((s, t) => s + t.count, 0) * (crit ? attack.critMultiplier : 1), sides: parseDice(attack.damage).terms[0]?.sides ?? 6, keep: "sum" },
          modifiers: [{ source: "Bônus de dano", value: attack.damageBonus }, ...damageModifiers].filter((m) => m.value !== 0),
          extraDice: [],
          target: null,
          targetLabel: null,
          peCost: 0,
          stakes: `${crit ? "Acerto crítico! " : ""}Quanto dano o golpe causa${options.damageResistance ? ` (a criatura ignora ${options.damageResistance})` : ""}.`,
        },
        (rng) => rollDamage(attack, crit, rng, options),
      );
      r.rolls.push(dmg.damageRoll);
      enc.threat.pv = Math.max(0, enc.threat.pv - dmg.damage);
      r.state.threatPv[threat.id] = enc.threat.pv;
      r.fact(`Ataque com ${profile.name}: ${hitRoll.attackRoll.total} contra Defesa ${defense} — ${crit ? "ACERTO CRÍTICO" : "acertou"}, ${dmg.damage} de dano (${threat.name}: ${enc.threat.pv}/${enc.threat.pvMax} PV).`, "mechanic");
      log(r, `Você causa ${dmg.damage} de dano${crit ? " (crítico)" : ""}.`);
      if (enc.threat.pv === 0) return victory(r);
    }
  } else if (a.type === "flee") {
    const roll = r.check(
      { skillId: a.skillId, dt: threat.fleeDt, label: `Fuga: ${SKILL_BY_ID.get(a.skillId)!.name}` },
      `Escapar de ${threat.name}. Se falhar, você continua ao alcance dela e ela age.`,
    );
    if (roll.outcome === "success") return fled(r);
    r.fact("Você tenta abrir distância, mas a criatura corta o caminho.");
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
  const roll = r.check({ skillId: "medicina", dt: 15, label: "Primeiros socorros em combate" }, "Tratar um ferimento no meio do combate exige Medicina. Seja qual for o resultado, a criatura age em seguida.");
  if (roll.outcome === "success") {
    const heal = healRoll(r);
    const before = r.char.pv;
    r.char.pv = Math.min(r.sheet.pvMax, r.char.pv + heal.total);
    r.rolls.push({ label: "Cura: primeiros socorros", kind: "effect", expression: "1d8", dice: heal.dice, modifiers: [], total: heal.total, outcome: "none", notes: [] });
    r.fact(`Você recupera ${r.char.pv - before} PV.`, "mechanic");
    log(r, `Você se cura em ${r.char.pv - before} PV.`);
  } else r.fact("As mãos tremem e o curativo não segura.");
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
    r.fact(`${threat.name} usa ${attack.name}: ${res.attackRoll.total} contra sua Defesa ${r.sheet.defense} — errou.`, "mechanic");
    r.fact(`${threat.name} investe com ${lowerName(attack.name)}, mas você consegue sair do caminho.`);
    log(r, `${threat.name} erra.`);
    return;
  }
  r.fact(`${threat.name} usa ${attack.name}: ${res.attackRoll.total} contra sua Defesa ${r.sheet.defense} — ${res.critical ? "CRÍTICO" : "acertou"}.`, "mechanic");
  if (attack.damageKind === "mental") {
    r.fact(`${attack.name} atinge sua mente${res.critical ? " em cheio" : ""}.`);
    sanityDamage(r, res.damage, attack.name);
  } else {
    const before = r.char.pv;
    const out = applyPhysicalDamage(r.char.pv, res.damage);
    r.char.pv = out.pv;
    r.events.push({ type: "resource", resource: "pv", delta: out.pv - before });
    r.fact(`${attack.name} acerta você${res.critical ? " com força brutal" : ""}.`);
    r.fact(`Você sofre ${res.damage} de dano (${r.char.pv}/${r.sheet.pvMax} PV).`, "mechanic");
    log(r, `${threat.name} causa ${res.damage} de dano.`);
    if (out.droppedToZero) dying(r);
  }
}

function sanityDamage(r: Resolution, amount: number, source: string) {
  const before = r.char.san;
  const out = applyMentalDamage(r.char.san, amount, r.sheet.mentalResistance);
  r.char.san = out.san;
  r.events.push({ type: "resource", resource: "san", delta: out.san - before });
  r.fact(`Dano mental (${source}): −${out.effective} SAN${r.sheet.mentalResistance ? ` (resistência ${r.sheet.mentalResistance})` : ""} (${r.char.san}/${r.sheet.sanMax}).`, "mechanic");
  if (r.state.encounter) log(r, `Você perde ${out.effective} SAN.`);
  if (out.insane) {
    r.char.conditions.push({ id: "enlouquecendo", source });
    r.fact("Sua Sanidade chega a 0: você está enlouquecendo.", "danger");
    downed(r);
  }
}

/** op-core.conditions.morrendo — a solo agent with no allies cannot be stabilized while unconscious. */
function dying(r: Resolution) {
  r.char.conditions.push({ id: "morrendo", source: "0 PV" });
  r.char.dyingRounds = 0;
  r.fact("Você cai com 0 PV e está morrendo.", "danger");
  for (let i = 1; i <= DYING_ROUNDS_TO_DEATH; i++) {
    r.char.dyingRounds = i;
    r.fact(i < DYING_ROUNDS_TO_DEATH ? `Turno ${i} morrendo: ninguém pode ajudar.` : `Você inicia o ${i}º turno morrendo e não resiste.`, "mechanic");
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
  r.fact(`${threat.name} se desfaz diante de você. O silêncio que fica é pesado, mas é silêncio.`);
  r.fact(`${threat.name} foi derrotado.`, "progress");
  r.remember("event", `Você derrotou ${threat.name}.`);
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
  r.fact("Você corre sem olhar para trás até a entrada. A criatura continua lá dentro, ferida ou não.");
  r.remember("event", "Você fugiu do confronto.");
  r.state.flags["ameaca-cacando"] = false;
  r.addUrgency(2, "a criatura agora sabe de você");
  r.state.flags["ameaca-cacando"] = false;
}

function log(r: Resolution, line: string) {
  r.state.encounter?.log.push(line);
}
