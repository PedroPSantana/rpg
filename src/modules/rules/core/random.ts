/**
 * Random sources for the rules engine.
 *
 * Production rolls use the operating system CSPRNG via `node:crypto` so the
 * outcome is unpredictable and cannot be influenced by the client or the AI.
 * Tests use a seeded generator so fixtures are reproducible.
 */
export interface RandomSource {
  /** Uniform integer in [1, sides]. */
  die(sides: number): number;
}

/** Mulberry32 — small, fast, deterministic. Only for tests/fixtures/content generation. */
export function seededRandom(seed: number | string): RandomSource & { next(): number } {
  let state = typeof seed === "number" ? seed >>> 0 : hashString(seed);
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    die(sides: number) {
      assertSides(sides);
      return Math.floor(next() * sides) + 1;
    },
  };
}

/** Replays a fixed sequence of die faces; throws if exhausted. For exact test fixtures. */
export function scriptedRandom(faces: number[]): RandomSource & { remaining(): number } {
  const queue = [...faces];
  return {
    die(sides: number) {
      assertSides(sides);
      const face = queue.shift();
      if (face === undefined) throw new Error("scriptedRandom: sem faces restantes");
      if (face < 1 || face > sides) throw new Error(`scriptedRandom: face ${face} inválida para d${sides}`);
      return face;
    },
    remaining: () => queue.length,
  };
}

export function hashString(input: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function assertSides(sides: number) {
  if (!Number.isInteger(sides) || sides < 2 || sides > 1000) {
    throw new Error(`Dado inválido: d${sides}`);
  }
}
