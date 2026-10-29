import { describe, expect, it } from "vitest";
import { generateAdventure } from "@/modules/adventures/generator";
import { seededRandom } from "@/modules/rules/core/random";
import { combatentePolicial, especialistaAcademico } from "@/modules/rules/systems/ordem-paranormal/__tests__/fixtures";
import { autoplay } from "../../evals/lib/autoplayer";

describe("autoplayer (Monte Carlo smoke)", () => {
  it("every session reaches an ending within the action budget", () => {
    for (let i = 0; i < 40; i++) {
      const { blueprint } = generateAdventure(`auto-${i}`);
      const r = autoplay(blueprint, i % 2 ? especialistaAcademico : combatentePolicial, seededRandom(i + 1));
      expect(r.endingId, `${i}: ${r.log.slice(-6).join(" | ")}`).not.toBeNull();
    }
  });
});
