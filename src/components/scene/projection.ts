import { areaOpenings, type AreaOpening, type Wall } from "@/modules/world/areas";
import type { MapDefinition, MapState, Position } from "@/modules/world/schema";

/**
 * One-point perspective for a single room. The camera stands behind the
 * room's near wall (a cutaway) and looks at the far wall. Coordinates are in
 * tiles: X runs left→right across the view, Z from the far wall (0) toward
 * the camera, Y is height above the floor.
 */
export const VIEW_W = 1600;
export const VIEW_H = 900;

type Area = MapDefinition["areas"][number];
export type Facing = "north" | "east";

export interface RoomView {
  facing: Facing;
  /** Room size in view space. */
  W: number;
  D: number;
  /** Wall height. */
  H: number;
  camY: number;
  /** Camera distance from the far wall. */
  Zc: number;
  F: number;
  horizon: number;
  /** Height of the frame (the width is always VIEW_W). */
  viewH: number;
  /** Closest depth worth drawing (just in front of the camera). */
  Znear: number;
  /** Which map wall each view wall shows. */
  walls: { back: Wall; left: Wall; right: Wall; behind: Wall };
  toView(p: Position): { X: number; Z: number };
}

export interface Projected {
  x: number;
  y: number;
  /** Pixels per tile at this depth. */
  s: number;
}

const FACINGS: Record<Facing, RoomView["walls"]> = {
  north: { back: "north", left: "west", right: "east", behind: "south" },
  east: { back: "east", left: "north", right: "south", behind: "west" },
};

/** Long, narrow rooms (corridors) are seen lengthwise. */
export function facingFor(rect: Area["rect"]): Facing {
  return rect.w > rect.h * 2.2 ? "east" : "north";
}

export function roomView(rect: Area["rect"], opts: { exterior?: boolean; facing?: Facing; viewH?: number } = {}): RoomView {
  const facing = opts.facing ?? (opts.exterior ? "north" : facingFor(rect));
  const W = facing === "north" ? rect.w : rect.h;
  const D = facing === "north" ? rect.h : rect.w;
  const H = opts.exterior ? 7 : 2.8;
  // A raised camera looks down into the room, so the floor (where things are) gets most of the frame.
  const camY = opts.exterior ? 2.6 : 2.25;
  const viewH = opts.viewH ?? VIEW_H;
  const horizon = viewH * (opts.exterior ? 0.36 : 0.235);
  // Pixels per tile at the nearest row of the room, so that row sits near the bottom edge.
  const k = (viewH - 40 - horizon) / camY;
  // Deeper rooms recede more; the far wall also has to fit the frame.
  const ratio = Math.min(0.72, Math.max(0.26, 1 / (1 + D * 0.2)));
  const sBack = Math.min(ratio * k, (VIEW_W * 0.72) / W, (horizon - 30) / Math.max(0.4, H - camY), (viewH * 0.62) / H);
  const r = sBack / k;
  const Zc = Math.max(D - 0.5, 0.5) / (1 - r);
  const F = sBack * Zc;
  const toView = (p: Position) =>
    facing === "north" ? { X: p.x - rect.x + 0.5, Z: p.y - rect.y + 0.5 } : { X: p.y - rect.y + 0.5, Z: rect.x + rect.w - 1 - p.x + 0.5 };
  return { facing, W, D, H, camY, Zc, F, horizon, viewH, Znear: Zc - 0.3, walls: FACINGS[facing], toView };
}

export function project(v: RoomView, X: number, Y: number, Z: number): Projected {
  const dz = Math.max(0.05, v.Zc - Z);
  const s = v.F / dz;
  return { x: VIEW_W / 2 + (X - v.W / 2) * s, y: v.horizon - (Y - v.camY) * s, s };
}

export function poly(v: RoomView, pts: [number, number, number][]) {
  return pts
    .map(([X, Y, Z]) => {
      const p = project(v, X, Y, Z);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(" ");
}

export type ViewWall = "back" | "left" | "right" | "behind";

export interface PlacedOpening extends AreaOpening {
  side: ViewWall;
  /** Centre along the wall, in view units (X on the back wall, Z on side walls). */
  at: number;
}

/** Doors and exits of a room, placed on the walls of the view. */
export function placeOpenings(def: MapDefinition, state: MapState, areaId: string, v: RoomView): PlacedOpening[] {
  return areaOpenings(def, state, areaId).map((o) => {
    const side = (Object.entries(v.walls).find(([, w]) => w === o.wall)?.[0] ?? "behind") as ViewWall;
    let at = 0;
    if (side === "back") at = o.along * v.W;
    else if (side === "left" || side === "right") at = v.facing === "north" ? o.along * v.D : (1 - o.along) * v.D;
    else at = o.along * v.W;
    return { ...o, side, at };
  });
}

/** Depth-sorted placement of things standing in the room. */
export function placeAt(v: RoomView, p: Position, lift = 0): Projected & { Z: number; X: number } {
  const { X, Z } = v.toView(p);
  const cz = Math.min(Math.max(Z, 0.35), v.D - 0.2);
  return { ...project(v, X, lift, cz), X, Z: cz };
}
