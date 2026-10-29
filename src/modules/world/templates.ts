import type { MapDefinition } from "./schema";

/**
 * Hand-authored map templates. Letters mark semantic slots that the
 * adventure generator binds to content:
 *   n = NPC, c = clue, t = threat, a = artifact, k = container/item,
 *   S = start spawn, E = arrival spawn by the exit, X = exit door, D = door.
 * Slot ids are the letter plus its 1-based order of appearance (c1, c2...).
 * Doors are named d1, d2... in reading order.
 */
export interface MapTemplate {
  id: string;
  name: string;
  kind: MapDefinition["kind"];
  ambience: MapDefinition["ambience"];
  rows: string[];
  areas: MapDefinition["areas"];
  /** Door slots with special initial state. */
  doors?: Record<string, { state?: "closed" | "locked" | "open"; hidden?: boolean; name?: string }>;
}

export const TEMPLATES: MapTemplate[] = [
  {
    id: "ext-rua",
    name: "Rua residencial",
    kind: "exterior",
    ambience: { fog: "#0b1020", ambient: 0.18, sky: "#05070d", flicker: false },
    rows: [
      "######################",
      "#,,,,,,,,,,,,,,,,,,,,#",
      "#,T,,,##########,,,T,#",
      "#,,,,,##########,,,,,#",
      "#,,c,,#####X####,,n,,#",
      "#,,,,,,,,,,E,,,,,,,,,#",
      "#,,,,,,,,,,,,,,,,,,,,#",
      "#oo,,,,,,,,,,,,,,,,oo#",
      "#,,,,,,,,,,,,,,,,,,,,#",
      "#,,,,,,,,,,,,,,,,,,,,#",
      "#,,n,,,,,,k,,,,,,,,,,#",
      "#,,,,,,,,,,,,,,,,,c,,#",
      "#,T,,,,,,,,,,,,,,,,T,#",
      "#,,,,,,,,,S,,,,,,,,,,#",
      "#,,,,,,,,,,,,,,,,,,,,#",
      "######################",
    ],
    areas: [{ id: "rua", name: "Rua", rect: { x: 1, y: 1, w: 20, h: 14 }, hidden: false }],
  },
  {
    id: "ext-sitio",
    name: "Sítio afastado",
    kind: "exterior",
    ambience: { fog: "#101a12", ambient: 0.14, sky: "#04070a", flicker: false },
    rows: [
      "########################",
      "#,,,,T,,,,,,,,,,,,T,,,,#",
      "#,T,,,,,,########,,,,T,#",
      "#,,,,,,,,########,,,,,,#",
      "#,,,n,,,,####X###,,,c,,#",
      "#,,,,,,,,,,,,E,,,,,,,,,#",
      "#,T,,,,,,,,,,,,,,,,,,,,#",
      "#,,,,,,,,,,,,,,,,,,T,,,#",
      "#,,,,,ooo,,,,,,,,,,,,,,#",
      "#,,c,,,,,,,,,,,k,,,,,,,#",
      "#,,,,,,,,,,,,,,,,,,n,,,#",
      "#,T,,,,,,,,,,,,,,,,,,,T#",
      "#,,,,,,,,,,,S,,,,,,,,,,#",
      "########################",
    ],
    areas: [{ id: "terreiro", name: "Terreiro", rect: { x: 1, y: 1, w: 22, h: 12 }, hidden: false }],
  },
  {
    id: "int-casarao",
    name: "Casarão",
    kind: "interior",
    ambience: { fog: "#140b0b", ambient: 0.1, sky: "#000000", flicker: true },
    rows: [
      "####################",
      "#c....#......#..t..#",
      "#.....#..a...#.....#",
      "#.....D......D.....#",
      "#o....#......#....o#",
      "###D#####D#####D####",
      "#..................#",
      "#.n................#",
      "#..................#",
      "####D#######D#######",
      "#.......#.........c#",
      "#.c.....#..........#",
      "#.......D.....k....#",
      "#o......#..........#",
      "#.......#....E.....#",
      "#############X######",
    ],
    areas: [
      { id: "biblioteca", name: "Biblioteca", rect: { x: 1, y: 1, w: 5, h: 4 }, hidden: false },
      { id: "capela", name: "Capela particular", rect: { x: 7, y: 1, w: 6, h: 4 }, hidden: false },
      { id: "covil", name: "Quarto selado", rect: { x: 14, y: 1, w: 5, h: 4 }, hidden: false },
      { id: "corredor", name: "Corredor", rect: { x: 1, y: 6, w: 18, h: 3 }, hidden: false },
      { id: "cozinha", name: "Cozinha", rect: { x: 1, y: 10, w: 7, h: 5 }, hidden: false },
      { id: "sala", name: "Sala de estar", rect: { x: 9, y: 10, w: 10, h: 5 }, hidden: false },
    ],
    doors: {
      d2: { state: "locked", name: "Porta trancada do quarto" },
      d5: { state: "closed", hidden: true, name: "Passagem atrás do papel de parede" },
    },
  },
  {
    id: "int-escola",
    name: "Escola desativada",
    kind: "interior",
    ambience: { fog: "#0b1214", ambient: 0.12, sky: "#000000", flicker: true },
    rows: [
      "######################",
      "#.c......#.....#..t..#",
      "#........#..a..D.....#",
      "#oo..oo..#.....#.....#",
      "#........#.....#o...o#",
      "####D#######D#####D###",
      "#....................#",
      "#..n.................#",
      "####D######D######D###",
      "#.......#.....#.....c#",
      "#..c....#..k..#......#",
      "#.......#.....#......#",
      "#.oo....#.....D......#",
      "#.......#..E..#......#",
      "###########X##########",
    ],
    areas: [
      { id: "sala-aula", name: "Sala de aula", rect: { x: 1, y: 1, w: 8, h: 4 }, hidden: false },
      { id: "diretoria", name: "Diretoria", rect: { x: 10, y: 1, w: 5, h: 4 }, hidden: false },
      { id: "covil", name: "Almoxarifado", rect: { x: 16, y: 1, w: 5, h: 4 }, hidden: false },
      { id: "corredor", name: "Corredor", rect: { x: 1, y: 6, w: 20, h: 2 }, hidden: false },
      { id: "laboratorio", name: "Laboratório", rect: { x: 1, y: 9, w: 7, h: 5 }, hidden: false },
      { id: "patio", name: "Pátio coberto", rect: { x: 9, y: 9, w: 5, h: 5 }, hidden: false },
      { id: "biblioteca", name: "Biblioteca", rect: { x: 15, y: 9, w: 6, h: 5 }, hidden: false },
    ],
    doors: {
      d1: { state: "locked", name: "Porta do almoxarifado" },
      d4: { state: "closed", hidden: true, name: "Alçapão sob o tapete" },
    },
  },
];

export const TEMPLATE_BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));

export interface SlotInfo {
  id: string;
  letter: string;
  position: { x: number; y: number };
}

/** Lists semantic slots and door slots of a template in reading order. */
export function templateSlots(t: MapTemplate) {
  const counters: Record<string, number> = {};
  const slots: SlotInfo[] = [];
  const spawns: Record<string, { x: number; y: number }> = {};
  t.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === "S") spawns.start = { x, y };
      else if (ch === "E") spawns.exit = { x, y };
      else if (/[nctakDX]/.test(ch)) {
        const letter = ch === "D" ? "d" : ch === "X" ? "x" : ch;
        counters[letter] = (counters[letter] ?? 0) + 1;
        slots.push({ id: `${letter}${counters[letter]}`, letter, position: { x, y } });
      }
    }),
  );
  return { slots, spawns };
}

/** Tile grid with slot markers replaced by floor (doors stay 'D'). */
export function templateTiles(t: MapTemplate): string[] {
  const floor = t.kind === "exterior" ? "," : ".";
  return t.rows.map((row) => row.replace(/[nctakSE]/g, floor).replace(/X/g, "D"));
}
