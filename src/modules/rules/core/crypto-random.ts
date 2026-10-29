import { randomInt } from "node:crypto";
import { assertSides, type RandomSource } from "./random";

/** Server-side authoritative random source (CSPRNG). Never import from client code. */
export const cryptoRandom: RandomSource = {
  die(sides: number) {
    assertSides(sides);
    return randomInt(1, sides + 1);
  },
};
