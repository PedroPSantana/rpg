import { BLOCKING_STATES, type MapDefinition, type MapState, type Position } from "./schema";

export const WALKABLE_TILES = new Set([".", ",", "D"]);

export function tileAt(def: MapDefinition, p: Position): string {
  if (p.y < 0 || p.y >= def.height || p.x < 0 || p.x >= def.width) return "#";
  return def.tiles[p.y][p.x] ?? "#";
}

export function objectAt(def: MapDefinition, state: MapState, p: Position) {
  return def.objects.filter((o) => o.position.x === p.x && o.position.y === p.y && isPresent(def, state, o.id));
}

/** Hidden, unrevealed objects do not exist for the player (but secret doors still block). */
export function isPresent(def: MapDefinition, state: MapState, objectId: string) {
  const o = def.objects.find((x) => x.id === objectId);
  if (!o) return false;
  const s = state.objects[objectId];
  return !o.hidden || !!s?.revealed;
}

export interface PathOptions {
  /** Treat closed (unlocked, revealed) interior doors as passable — they get opened on the way. */
  passClosedDoors?: boolean;
  /** Tiles the route must not cross (the destination itself is always allowed). */
  avoid?: (p: Position) => boolean;
}

export function isBlocked(def: MapDefinition, state: MapState, p: Position, opts: PathOptions = {}): boolean {
  if (!WALKABLE_TILES.has(tileAt(def, p))) return true;
  for (const o of def.objects) {
    if (o.position.x !== p.x || o.position.y !== p.y) continue;
    const s = state.objects[o.id]?.state ?? o.initialState;
    if (opts.passClosedDoors && o.kind === "door" && s === "closed" && isPresent(def, state, o.id)) continue;
    if (BLOCKING_STATES[o.kind]?.includes(s)) return true;
  }
  return false;
}

/** Closed doors along a path (in order), which must be opened to walk it. */
export function doorsOnPath(def: MapDefinition, state: MapState, path: Position[]) {
  return path.flatMap((p) => def.objects.filter((o) => o.kind === "door" && o.position.x === p.x && o.position.y === p.y && (state.objects[o.id]?.state ?? o.initialState) === "closed"));
}

/** Hidden areas are impassable until revealed. */
export function inHiddenArea(def: MapDefinition, state: MapState, p: Position) {
  return def.areas.some(
    (a) => a.hidden && !state.revealedAreas.includes(a.id) && p.x >= a.rect.x && p.x < a.rect.x + a.rect.w && p.y >= a.rect.y && p.y < a.rect.y + a.rect.h,
  );
}

export function isWalkable(def: MapDefinition, state: MapState, p: Position, opts: PathOptions = {}) {
  return !isBlocked(def, state, p, opts) && !inHiddenArea(def, state, p);
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** 4-connected BFS shortest path (inclusive of start and goal); null if unreachable. */
export function findPath(def: MapDefinition, state: MapState, from: Position, to: Position, opts: PathOptions = {}): Position[] | null {
  if (!isWalkable(def, state, to, opts)) return null;
  const key = (p: Position) => p.y * def.width + p.x;
  const prev = new Map<number, number>();
  const start = key(from);
  const goal = key(to);
  const queue = [from];
  prev.set(start, -1);
  while (queue.length) {
    const cur = queue.shift()!;
    if (key(cur) === goal) break;
    for (const [dx, dy] of DIRS) {
      const n = { x: cur.x + dx, y: cur.y + dy };
      const k = key(n);
      if (prev.has(k) || !isWalkable(def, state, n, opts)) continue;
      if (opts.avoid && k !== goal && opts.avoid(n)) continue;
      prev.set(k, key(cur));
      queue.push(n);
    }
  }
  if (!prev.has(goal)) return null;
  const path: Position[] = [];
  for (let k = goal; k !== -1; k = prev.get(k)!) path.unshift({ x: k % def.width, y: Math.floor(k / def.width) });
  return path;
}

/** Interaction requires being on an adjacent tile (including diagonals) or the same tile. */
export function isAdjacent(a: Position, b: Position) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;
}

/**
 * Shortest route to a tile adjacent to an object, reachable from `from`.
 * The route never steps on the object's own tile (so approaching a door stays
 * on the near side) and, when possible, avoids `opts.avoid` tiles.
 */
export function approachTile(def: MapDefinition, state: MapState, from: Position, target: Position, opts: PathOptions = {}): Position[] | null {
  if (isAdjacent(from, target)) return [from];
  const onTarget = (p: Position) => p.x === target.x && p.y === target.y;
  const search = (avoid?: (p: Position) => boolean) => {
    let best: Position[] | null = null;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const p = { x: target.x + dx, y: target.y + dy };
        if (avoid?.(p)) continue;
        const path = findPath(def, state, from, p, { ...opts, avoid: (q) => onTarget(q) || !!avoid?.(q) });
        if (path && (!best || path.length < best.length)) best = path;
      }
    return best;
  };
  return (opts.avoid && search(opts.avoid)) || search();
}

/**
 * The map as the player may know it: unrevealed hidden objects are removed, their
 * tiles rendered as wall, and unrevealed hidden areas are walled over.
 */
export function playerView(def: MapDefinition, state: MapState): MapDefinition {
  const concealed = def.objects.filter((o) => !isPresent(def, state, o.id));
  const hiddenAreas = def.areas.filter((a) => a.hidden && !state.revealedAreas.includes(a.id));
  const tiles = def.tiles.map((row, y) =>
    [...row].map((ch, x) => ((ch === "D" && concealed.some((o) => o.position.x === x && o.position.y === y)) || inHiddenArea(def, state, { x, y }) ? "#" : ch)).join(""),
  );
  return {
    ...def,
    tiles,
    objects: def.objects.filter((o) => isPresent(def, state, o.id)),
    areas: def.areas.filter((a) => !hiddenAreas.includes(a)),
  };
}
