import { isPresent, isWalkable, type PathOptions } from "./grid";
import type { MapDefinition, MapObject, MapState, Position } from "./schema";

type Area = MapDefinition["areas"][number];
export type Wall = "north" | "south" | "west" | "east";

export function inRect(r: Area["rect"], p: Position) {
  return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
}

/** The area containing a tile; door tiles (between rooms) resolve to a neighbouring area. */
export function areaAt(def: MapDefinition, p: Position): Area | null {
  const direct = def.areas.find((a) => inRect(a.rect, p));
  if (direct) return direct;
  for (const [dx, dy] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ]) {
    const a = def.areas.find((x) => inRect(x.rect, { x: p.x + dx, y: p.y + dy }));
    if (a) return a;
  }
  return def.areas[0] ?? null;
}

/** Stable key for an area across maps. */
export const areaKey = (mapId: string, areaId: string) => `${mapId}:${areaId}`;

export interface AreaOpening {
  object: MapObject;
  wall: Wall;
  /** 0..1 position along the wall, west→east or north→south. */
  along: number;
  /** Area on the other side (same map), or null for map exits / outer walls. */
  toAreaId: string | null;
}

/** Doors and exits on the boundary of an area, with the wall they sit on. */
export function areaOpenings(def: MapDefinition, state: MapState, areaId: string): AreaOpening[] {
  const area = def.areas.find((a) => a.id === areaId);
  if (!area) return [];
  const { x, y, w, h } = area.rect;
  const out: AreaOpening[] = [];
  for (const o of def.objects) {
    if ((o.kind !== "door" && o.kind !== "exit") || !isPresent(def, state, o.id)) continue;
    const p = o.position;
    let wall: Wall | null = null;
    let along = 0;
    if (p.y === y - 1 && p.x >= x && p.x < x + w) [wall, along] = ["north", (p.x - x + 0.5) / w];
    else if (p.y === y + h && p.x >= x && p.x < x + w) [wall, along] = ["south", (p.x - x + 0.5) / w];
    else if (p.x === x - 1 && p.y >= y && p.y < y + h) [wall, along] = ["west", (p.y - y + 0.5) / h];
    else if (p.x === x + w && p.y >= y && p.y < y + h) [wall, along] = ["east", (p.y - y + 0.5) / h];
    if (!wall) continue;
    const beyond = { north: { x: p.x, y: p.y - 1 }, south: { x: p.x, y: p.y + 1 }, west: { x: p.x - 1, y: p.y }, east: { x: p.x + 1, y: p.y } }[wall];
    const other = def.areas.find((a) => a.id !== areaId && inRect(a.rect, beyond));
    out.push({ object: o, wall, along, toAreaId: other?.id ?? null });
  }
  return out;
}

/** Objects standing inside an area (not counting its doors). */
export function objectsInArea(def: MapDefinition, state: MapState, areaId: string) {
  const area = def.areas.find((a) => a.id === areaId);
  if (!area) return [];
  return def.objects.filter((o) => o.kind !== "door" && o.kind !== "exit" && inRect(area.rect, o.position) && isPresent(def, state, o.id));
}

/** Breadth-first route from `from` to the nearest walkable tile of an area. */
export function pathToArea(def: MapDefinition, state: MapState, from: Position, areaId: string, opts: PathOptions = {}): Position[] | null {
  const area = def.areas.find((a) => a.id === areaId);
  if (!area) return null;
  if (inRect(area.rect, from)) return [from];
  const key = (p: Position) => p.y * def.width + p.x;
  const prev = new Map<number, number>([[key(from), -1]]);
  const queue = [from];
  let goal: Position | null = null;
  while (queue.length && !goal) {
    const cur = queue.shift()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const n = { x: cur.x + dx, y: cur.y + dy };
      const k = key(n);
      if (prev.has(k) || !isWalkable(def, state, n, opts)) continue;
      if (opts.avoid?.(n) && !inRect(area.rect, n)) continue;
      prev.set(k, key(cur));
      if (inRect(area.rect, n)) {
        goal = n;
        break;
      }
      queue.push(n);
    }
  }
  if (!goal) return null;
  const path: Position[] = [];
  for (let k = key(goal); k !== -1; k = prev.get(k)!) path.unshift({ x: k % def.width, y: Math.floor(k / def.width) });
  return path;
}
