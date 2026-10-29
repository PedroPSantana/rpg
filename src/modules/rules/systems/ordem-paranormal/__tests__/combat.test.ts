import { describe, expect, it } from "vitest";
import { scriptedRandom } from "../../../core/random";
import { parseDice, formatDice } from "../../../core/dice";
import { applyMentalDamage, applyPhysicalDamage, resolveAttack, rollInitiative, type Attack } from "../combat";

const revolver: Attack = { id: "revolver", name: "Revólver", attackDice: 2, attackBonus: 5, damage: "2d6", damageBonus: 0, critThreshold: 19, critMultiplier: 3, damageKind: "physical" };

describe("dice expressions", () => {
  it("parses and formats", () => {
    expect(parseDice("2d6+3")).toEqual({ terms: [{ count: 2, sides: 6 }], modifier: 3 });
    expect(parseDice("1d8 + 1d6 - 1")).toEqual({ terms: [{ count: 1, sides: 8 }, { count: 1, sides: 6 }], modifier: -1 });
    expect(formatDice(parseDice("d20"))).toBe("1d20");
    expect(() => parseDice("2x6")).toThrow();
    expect(() => parseDice("-1d6")).toThrow();
  });
});

describe("op-core attacks", () => {
  it("misses when total is below Defesa and deals no damage", () => {
    const r = resolveAttack(revolver, 19, scriptedRandom([3, 12]));
    expect(r.hit).toBe(false);
    expect(r.damage).toBe(0);
    expect(r.damageRoll).toBeUndefined();
  });

  it("hits when total equals Defesa", () => {
    const r = resolveAttack(revolver, 17, scriptedRandom([12, 5, 4, 6]));
    expect(r.hit).toBe(true);
    expect(r.critical).toBe(false);
    expect(r.damage).toBe(10);
  });

  it("critical multiplies weapon dice but not fixed bonuses", () => {
    // natural 19 within 19/x3 → 6d6 + 2
    const r = resolveAttack({ ...revolver, damageBonus: 2 }, 15, scriptedRandom([19, 1, 1, 1, 1, 1, 1, 1]));
    expect(r.critical).toBe(true);
    expect(r.attackRoll.outcome).toBe("critical");
    expect(r.damageRoll!.dice).toHaveLength(6);
    expect(r.damageRoll!.expression).toBe("6d6");
    expect(r.damage).toBe(6 + 2);
  });

  it("a natural in threat range that misses is not a critical", () => {
    const r = resolveAttack({ ...revolver, attackBonus: 0 }, 25, scriptedRandom([19, 2]));
    expect(r.hit).toBe(false);
    expect(r.critical).toBe(false);
  });

  it("damage resistance reduces but never below zero", () => {
    const r = resolveAttack(revolver, 10, scriptedRandom([15, 1, 1, 1]), { damageResistance: 5 });
    expect(r.damage).toBe(0);
  });

  it("initiative orders by total, then AGI", () => {
    const order = rollInitiative(
      [
        { id: "a", name: "A", agility: 1, initiativeBonus: 0 },
        { id: "b", name: "B", agility: 3, initiativeBonus: 0 },
        { id: "c", name: "C", agility: 1, initiativeBonus: 5 },
      ],
      scriptedRandom([10, 2, 3, 10, 5]),
    );
    // A: 10, B: max(2,3,10)=10, C: 5+5=10 → tie on 10; AGI breaks: B(3) then A/C(1) by id
    expect(order.map((o) => o.entrant.id)).toEqual(["b", "a", "c"]);
  });

  it("PV and SAN damage clamp at zero and flag thresholds", () => {
    expect(applyPhysicalDamage(5, 8)).toEqual({ pv: 0, droppedToZero: true });
    expect(applyPhysicalDamage(0, 3)).toEqual({ pv: 0, droppedToZero: false });
    expect(applyMentalDamage(10, 4, 1)).toEqual({ san: 7, effective: 3, insane: false });
    expect(applyMentalDamage(2, 4)).toMatchObject({ san: 0, insane: true });
  });
});
