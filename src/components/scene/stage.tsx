"use client";

import { useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { areaAt, inRect, objectsInArea } from "@/modules/world/areas";
import { placeKindOf, templateOf, type TemplateId } from "@/modules/world/scenes";
import type { MapDefinition, MapObject, MapState } from "@/modules/world/schema";
import { roomStyle, type RoomStyle } from "./decor";
import { placeAt, placeOpenings, poly, project, roomView, VIEW_H, VIEW_W, type PlacedOpening, type RoomView } from "./projection";
import { Furniture, Sprite, spriteHeight, type SpriteInfo } from "./sprites";

export interface StageProps {
  map: MapDefinition;
  maps: Pick<MapDefinition, "areas" | "kind">[];
  state: MapState;
  placeName: string;
  people: { name: string; role: string; objectId: string }[];
  /** Threat objects: element and whether the agent has met it. */
  threats: Record<string, { element: string; known: boolean }>;
  selectedId: string | null;
  areaNames: Record<string, string>;
  effects: string[];
  effectNonce: number;
  onObject: (o: MapObject) => void;
  onOpening: (o: PlacedOpening) => void;
}

type Drawable = { key: string; Z: number; node: ReactNode };

const FURNITURE_OUTSIDE: Record<string, string> = { "ext-rua": "car", "ext-sitio": "fence" };

/** Where the room ends and the façade begins on an exterior map. */
function exteriorFrame(map: MapDefinition, area: MapDefinition["areas"][number]) {
  const exits = map.objects.filter((o) => o.kind === "exit" && inRect(area.rect, o.position));
  const row = exits.length ? Math.max(...exits.map((e) => e.position.y)) : area.rect.y;
  const line = map.tiles[row] ?? "";
  const cols = [...line].map((ch, x) => (ch === "#" && x > 0 && x < line.length - 1 ? x : -1)).filter((x) => x >= 0);
  const rect = { x: area.rect.x, y: row + 1, w: area.rect.w, h: area.rect.y + area.rect.h - row - 1 };
  return { rect, exits, facade: cols.length ? { x0: Math.min(...cols), x1: Math.max(...cols) + 1 } : { x0: area.rect.x + 4, x1: area.rect.x + area.rect.w - 4 } };
}

export function Stage(props: StageProps) {
  const { map, state } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const area = areaAt(map, state.player) ?? map.areas[0];
  const exterior = map.kind === "exterior";
  const template = templateOf(map);
  const placeKind = placeKindOf(props.maps);

  const scene = useMemo(() => {
    const frame = exterior ? exteriorFrame(map, area) : null;
    const v = roomView(frame?.rect ?? area.rect, { exterior });
    const style = exterior ? null : roomStyle(template, area.id);
    const openings: PlacedOpening[] = exterior
      ? frame!.exits.map((o) => ({ object: o, wall: "north", along: 0, toAreaId: null, side: "back", at: v.toView({ x: o.position.x, y: frame!.rect.y }).X }))
      : placeOpenings(map, state, area.id, v);
    const objects = exterior ? map.objects.filter((o) => o.kind !== "exit" && o.kind !== "door" && inRect(area.rect, o.position)) : objectsInArea(map, state, area.id);
    const rect = frame?.rect ?? area.rect;
    const props2: { kind: string; p: { x: number; y: number } }[] = [];
    for (let y = area.rect.y; y < area.rect.y + area.rect.h; y++)
      for (let x = area.rect.x; x < area.rect.x + area.rect.w; x++) {
        const ch = map.tiles[y]?.[x];
        if (ch === "o") props2.push({ kind: exterior ? FURNITURE_OUTSIDE[template] ?? "crate" : style!.furniture, p: { x, y } });
        if (ch === "T") props2.push({ kind: "tree", p: { x, y } });
      }
    return { v, style, openings, objects, frame, rect, furniture: props2 };
  }, [map, state, area, exterior, template]);

  const { v, style, openings, objects, frame, furniture } = scene;
  const player = placeAt(v, state.player);
  const darkness = Math.min(0.78, Math.max(0.3, (exterior ? 0.62 : 0.86) - map.ambience.ambient * 2.2));

  const drawables: Drawable[] = [];
  for (const f of furniture) {
    const p = placeAt(v, f.p);
    drawables.push({
      key: `f${f.p.x}.${f.p.y}`,
      Z: p.Z,
      node: (
        <g transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${p.s.toFixed(2)})`} style={{ pointerEvents: "none" }} opacity={0.95}>
          <Furniture kind={f.kind} />
        </g>
      ),
    });
  }
  const labels: { id: string; x: number; y: number; text: string }[] = [];
  for (const o of objects) {
    const p = placeAt(v, o.position);
    const st = state.objects[o.id]?.state ?? o.initialState;
    const person = props.people.find((n) => n.objectId === o.id);
    const threat = props.threats[o.id];
    const info: SpriteInfo = { model: o.model, kind: o.kind, state: st, name: person?.name ?? o.name, role: person?.role, element: threat?.element, known: threat?.known };
    const h = spriteHeight(info);
    const selected = props.selectedId === o.id;
    if (hover === o.id || selected) labels.push({ id: o.id, x: p.x, y: p.y - h * p.s - 14, text: o.name });
    drawables.push({
      key: o.id,
      Z: p.Z + 0.01,
      node: (
        <g
          transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${p.s.toFixed(2)})`}
          className={`sc-obj${selected ? " sc-selected" : ""}`}
          role="button"
          tabIndex={0}
          aria-label={o.name}
          onPointerEnter={() => setHover(o.id)}
          onPointerLeave={() => setHover((x) => (x === o.id ? null : x))}
          onClick={(e) => {
            e.stopPropagation();
            props.onObject(o);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") props.onObject(o);
          }}
        >
          <rect x={-0.45} y={-h - 0.1} width={0.9} height={h + 0.2} fill="transparent" />
          <Sprite info={info} />
        </g>
      ),
    });
  }
  drawables.sort((a, b) => a.Z - b.Z);
  const behind = openings.filter((o) => o.side === "behind");

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = wrap.current;
    if (!el || e.pointerType === "touch") return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--px", (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
    el.style.setProperty("--py", (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
  };
  const layer = (k: number) => ({ transform: `translate(calc(var(--px, 0) * ${-k}px), calc(var(--py, 0) * ${-k * 0.5}px))`, transition: "transform 0.5s ease-out" });
  const sceneKey = `${map.id}:${area.id}`;

  return (
    <div ref={wrap} className="absolute inset-0 overflow-hidden bg-black" onPointerMove={onMove}>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid slice" className="h-full w-full select-none" role="img" aria-label={`${map.name}: ${area.name}`}>
        <Defs fog={map.ambience.fog} />
        <g key={sceneKey} className="sc-enter" style={{ transformOrigin: "800px 450px" }}>
          <g style={{ transform: "scale(1.04)", transformOrigin: "800px 450px" }}>
            <g style={layer(6)}>
              {exterior ? <Outside v={v} map={map} template={template} placeKind={placeKind} placeName={props.placeName} facade={frame!.facade} rectX={frame!.rect.x} /> : <Room v={v} style={style!} flicker={map.ambience.flicker} />}
              {openings
                .filter((o) => o.side !== "behind")
                .map((o) => (
                  <Opening
                    key={o.object.id}
                    v={v}
                    o={o}
                    state={state.objects[o.object.id]?.state ?? o.object.initialState}
                    label={o.toAreaId ? props.areaNames[o.toAreaId] ?? o.object.name : o.object.name}
                    hover={hover === o.object.id || props.selectedId === o.object.id}
                    onHover={(h) => setHover(h ? o.object.id : null)}
                    onClick={() => props.onOpening(o)}
                  />
                ))}
              <LightPool x={player.x} y={player.y} s={player.s} />
            </g>
            <g style={layer(12)}>{drawables.map((d) => <g key={d.key}>{d.node}</g>)}</g>
            <g style={layer(18)} pointerEvents="none">
              <Atmosphere v={v} fog={map.ambience.fog} exterior={exterior} />
            </g>
            <g pointerEvents="none">
              <mask id="sc-lantern">
                <rect x="-100" y="-100" width={VIEW_W + 200} height={VIEW_H + 200} fill="#fff" />
                <ellipse cx={player.x} cy={player.y - player.s * 0.9} rx={Math.min(900, player.s * 4.2)} ry={Math.min(700, player.s * 3.4)} fill="url(#sc-hole)" />
              </mask>
              <rect key={`d${props.effectNonce}`} x="-100" y="-100" width={VIEW_W + 200} height={VIEW_H + 200} fill="#04030a" opacity={darkness} mask="url(#sc-lantern)" className={props.effects.includes("lights_flicker") ? "sc-flicker" : undefined} />
            </g>
            <g pointerEvents="none">
              {labels.map((l) => (
                <g key={l.id} transform={`translate(${l.x.toFixed(0)} ${Math.max(28, l.y).toFixed(0)})`}>
                  <rect x={-(l.text.length * 7.6) / 2 - 10} y="-17" width={l.text.length * 7.6 + 20} height="26" rx="13" fill="#0b0a0d" opacity="0.85" stroke="#d6a55a" strokeOpacity="0.5" />
                  <text textAnchor="middle" y="1" fill="#ece6da" fontSize="15" fontFamily="var(--font-sans)">
                    {l.text}
                  </text>
                </g>
              ))}
            </g>
          </g>
        </g>
        <rect width={VIEW_W} height={VIEW_H} fill="url(#sc-vignette)" pointerEvents="none" />
        <rect width={VIEW_W} height={VIEW_H} fill="url(#sc-grain)" opacity="0.07" pointerEvents="none" />
      </svg>
      {behind.length > 0 && (
        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
          {behind.map((o) => {
            const st = state.objects[o.object.id]?.state ?? o.object.initialState;
            return (
              <button
                key={o.object.id}
                type="button"
                onClick={() => props.onOpening(o)}
                className="rounded-full border border-line/80 bg-ink/80 px-3 py-1 text-xs text-ash backdrop-blur transition hover:border-gold/60 hover:text-bone"
              >
                ↓ {o.toAreaId ? props.areaNames[o.toAreaId] ?? o.object.name : o.object.name}
                {st === "locked" ? " · trancada" : ""}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Defs({ fog }: { fog: string }) {
  return (
    <defs>
      <filter id="sc-turb" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" />
        <feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 1.2 -0.35" />
      </filter>
      <filter id="sc-blotch" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="3" seed="3" />
        <feColorMatrix values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.05  0 0 0 2.2 -1.05" />
      </filter>
      <filter id="sc-blur" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="30" />
      </filter>
      <pattern id="sc-grain" width="200" height="200" patternUnits="userSpaceOnUse">
        <rect width="200" height="200" filter="url(#sc-turb)" />
      </pattern>
      <pattern id="sc-grime" width="900" height="600" patternUnits="userSpaceOnUse">
        <rect width="900" height="600" filter="url(#sc-blotch)" />
      </pattern>
      <pattern id="sc-wire" width="0.12" height="0.12" patternUnits="userSpaceOnUse">
        <path d="M0 0 L0.12 0.12 M0.12 0 L0 0.12" stroke="#9fb0c0" strokeWidth="0.008" />
      </pattern>
      <radialGradient id="sc-hole">
        <stop offset="0" stopColor="#000" />
        <stop offset="0.45" stopColor="#000" stopOpacity="0.85" />
        <stop offset="1" stopColor="#000" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="sc-pool">
        <stop offset="0" stopColor="#ffd9a1" stopOpacity="0.32" />
        <stop offset="0.6" stopColor="#ffb35a" stopOpacity="0.08" />
        <stop offset="1" stopColor="#ffb35a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="sc-dark">
        <stop offset="0" stopColor="#000" stopOpacity="0.95" />
        <stop offset="0.7" stopColor="#000" stopOpacity="0.6" />
        <stop offset="1" stopColor="#000" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="sc-vignette" cx="50%" cy="50%" r="75%">
        <stop offset="0.55" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.85" />
      </radialGradient>
      <linearGradient id="sc-fog" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={fog} stopOpacity="0" />
        <stop offset="0.5" stopColor={fog} stopOpacity="0.55" />
        <stop offset="1" stopColor={fog} stopOpacity="0" />
      </linearGradient>
      <linearGradient id="sc-ceilshade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#000" stopOpacity="0.7" />
        <stop offset="1" stopColor="#000" stopOpacity="0.1" />
      </linearGradient>
      <linearGradient id="sc-cone" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffe2a8" stopOpacity="0.35" />
        <stop offset="1" stopColor="#ffe2a8" stopOpacity="0" />
      </linearGradient>
    </defs>
  );
}

function Room({ v, style, flicker }: { v: RoomView; style: RoomStyle; flicker: boolean }) {
  const { W, H, Znear } = v;
  const zEnd = Math.min(Znear, v.D + 4);
  const floorCells: ReactNode[] = [];
  if (style.floor === "checker" || style.floor === "tiles") {
    const step = style.floor === "tiles" ? 0.5 : 1;
    for (let i = 0; i < W / step; i++)
      for (let j = 0; j < zEnd / step; j++)
        if ((i + j) % 2)
          floorCells.push(
            <polygon
              key={`${i}.${j}`}
              points={poly(v, [
                [i * step, 0, j * step],
                [(i + 1) * step, 0, j * step],
                [(i + 1) * step, 0, Math.min(zEnd, (j + 1) * step)],
                [i * step, 0, Math.min(zEnd, (j + 1) * step)],
              ])}
              fill={style.floorB}
            />,
          );
  } else if (style.floor === "planks") {
    for (let i = 1; i < W / 0.32; i++) floorCells.push(<polygon key={i} points={poly(v, [[i * 0.32, 0, 0], [i * 0.32 + 0.012, 0, 0], [i * 0.32 + 0.012, 0, zEnd], [i * 0.32, 0, zEnd]])} fill={style.floorB} />);
    for (let j = 1; j < zEnd; j += 1.3) for (let i = 0; i < W / 0.32; i++) if ((i * 7 + Math.round(j * 3)) % 3 === 0) floorCells.push(<polygon key={`s${i}.${j}`} points={poly(v, [[i * 0.32, 0, j], [(i + 1) * 0.32, 0, j], [(i + 1) * 0.32, 0, j + 0.03], [i * 0.32, 0, j + 0.03]])} fill={style.floorB} />);
  } else {
    floorCells.push(<polyline key="c1" points={poly(v, [[W * 0.2, 0, 0.5], [W * 0.35, 0, 1.6], [W * 0.3, 0, 2.6]])} stroke={style.floorB} strokeWidth="2" fill="none" />);
    floorCells.push(<polyline key="c2" points={poly(v, [[W * 0.7, 0, 0.2], [W * 0.62, 0, 1.2]])} stroke={style.floorB} strokeWidth="2" fill="none" />);
  }
  const wallPts = {
    back: poly(v, [[0, 0, 0], [W, 0, 0], [W, H, 0], [0, H, 0]]),
    left: poly(v, [[0, 0, 0], [0, H, 0], [0, H, zEnd], [0, 0, zEnd]]),
    right: poly(v, [[W, 0, 0], [W, H, 0], [W, H, zEnd], [W, 0, zEnd]]),
    floor: poly(v, [[0, 0, 0], [W, 0, 0], [W, 0, zEnd], [0, 0, zEnd]]),
    ceil: poly(v, [[0, H, 0], [W, H, 0], [W, H, zEnd], [0, H, zEnd]]),
  };
  const back = project(v, 0, 0, 0);
  const wh = style.wainscotH;
  return (
    <g>
      <rect width={VIEW_W} height={VIEW_H} fill="#050407" />
      {style.ceiling ? (
        <g>
          <polygon points={wallPts.ceil} fill={style.ceiling} />
          <polygon points={wallPts.ceil} fill="url(#sc-ceilshade)" />
          {[0.3, 0.62].map((t) => {
            const z = v.D * t;
            return <polygon key={t} className={flicker && t > 0.5 ? "sc-buzz" : undefined} points={poly(v, [[W / 2 - 0.6, H - 0.02, z], [W / 2 + 0.6, H - 0.02, z], [W / 2 + 0.6, H - 0.02, z + 0.12], [W / 2 - 0.6, H - 0.02, z + 0.12]])} fill="#cfd8d0" opacity={flicker && t > 0.5 ? 0.6 : 0.18} />;
          })}
        </g>
      ) : (
        <g>
          <rect width={VIEW_W} height={project(v, 0, H, 0).y + 4} fill="#0a0d14" />
          <polygon points={wallPts.ceil} fill="#1a1a1c" opacity="0.65" />
          {Array.from({ length: 7 }, (_, i) => (
            <polygon key={i} points={poly(v, [[(W / 7) * i, H, 0], [(W / 7) * i + 0.05, H, 0], [(W / 7) * i + 0.05, H, zEnd], [(W / 7) * i, H, zEnd]])} fill="#2a2a2c" />
          ))}
        </g>
      )}
      <polygon points={wallPts.floor} fill={style.floorA} />
      {floorCells}
      <polygon points={wallPts.floor} fill="url(#sc-grime)" opacity="0.6" />
      <polygon points={wallPts.left} fill={style.wallShade} />
      <polygon points={wallPts.right} fill={style.wallShade} />
      <polygon points={wallPts.back} fill={style.wall} />
      {style.wainscot && (
        <g>
          <polygon points={poly(v, [[0, 0, 0], [W, 0, 0], [W, wh, 0], [0, wh, 0]])} fill={style.wainscot} />
          <polygon points={poly(v, [[0, 0, 0], [0, wh, 0], [0, wh, zEnd], [0, 0, zEnd]])} fill={style.wainscot} opacity="0.85" />
          <polygon points={poly(v, [[W, 0, 0], [W, wh, 0], [W, wh, zEnd], [W, 0, zEnd]])} fill={style.wainscot} opacity="0.85" />
        </g>
      )}
      <polygon points={wallPts.back} fill="url(#sc-grime)" />
      <polygon points={wallPts.left} fill="url(#sc-grime)" />
      <polygon points={wallPts.right} fill="url(#sc-grime)" />
      <SideDecor v={v} kind={style.side ?? null} zEnd={zEnd} />
      <g transform={`translate(${back.x.toFixed(1)} ${back.y.toFixed(1)}) scale(${back.s.toFixed(3)})`}>{style.back(W, H)}</g>
      {/* Contact shadows where walls meet the floor */}
      <polyline points={poly(v, [[0, 0, zEnd], [0, 0, 0], [W, 0, 0], [W, 0, zEnd]])} stroke="#000" strokeOpacity="0.55" strokeWidth="5" fill="none" />
    </g>
  );
}

function SideDecor({ v, kind, zEnd }: { v: RoomView; kind: RoomStyle["side"] | null; zEnd: number }) {
  if (!kind) return null;
  const out: ReactNode[] = [];
  const W = v.W;
  const span = Math.min(zEnd, v.D);
  if (kind === "windows") {
    for (let z = 0.6; z + 1 < span; z += 1.8) {
      out.push(<polygon key={`w${z}`} points={poly(v, [[W, 1.0, z], [W, 2.2, z], [W, 2.2, z + 1.1], [W, 1.0, z + 1.1]])} fill="#1b2738" stroke="#2a2620" strokeWidth="4" />);
      out.push(<polyline key={`b${z}`} points={poly(v, [[W, 1.6, z], [W, 1.6, z + 1.1]])} stroke="#141312" strokeWidth="3" fill="none" />);
    }
  }
  if (kind === "lockers") {
    for (const X of [0, W])
      for (let z = 0.3; z + 0.5 < span; z += 0.55) {
        if (Math.floor(z * 7) % 5 === 0) continue;
        out.push(<polygon key={`l${X}.${z}`} points={poly(v, [[X, 0.05, z], [X, 1.85, z], [X, 1.85, z + 0.5], [X, 0.05, z + 0.5]])} fill="#3d4a52" stroke="#262d33" strokeWidth="2" />);
      }
  }
  if (kind === "portraits") {
    for (const X of [0, W])
      for (let z = 0.8; z + 0.6 < span; z += 2.2) out.push(<polygon key={`p${X}.${z}`} points={poly(v, [[X, 1.3, z], [X, 2.0, z], [X, 2.0, z + 0.55], [X, 1.3, z + 0.55]])} fill="#2a2018" stroke="#5a4630" strokeWidth="4" />);
  }
  if (kind === "shelves") {
    for (const X of [0, W]) {
      out.push(<polygon key={`s${X}`} points={poly(v, [[X, 0, 0.2], [X, 2.3, 0.2], [X, 2.3, span - 0.3], [X, 0, span - 0.3]])} fill="#2a2018" opacity="0.9" />);
      for (const y of [0.5, 1.0, 1.5, 2.0]) out.push(<polyline key={`sl${X}.${y}`} points={poly(v, [[X, y, 0.2], [X, y, span - 0.3]])} stroke="#4a3a28" strokeWidth="3" fill="none" />);
    }
  }
  return <g>{out}</g>;
}

function Opening({ v, o, state, label, hover, onHover, onClick }: { v: RoomView; o: PlacedOpening; state: string; label: string; hover: boolean; onHover: (h: boolean) => void; onClick: () => void }) {
  const w = 0.95;
  const h = 2.05;
  const pts: [number, number, number][] =
    o.side === "back"
      ? [
          [o.at - w / 2, 0, 0.01],
          [o.at + w / 2, 0, 0.01],
          [o.at + w / 2, h, 0.01],
          [o.at - w / 2, h, 0.01],
        ]
      : (() => {
          const X = o.side === "left" ? 0.01 : v.W - 0.01;
          return [
            [X, 0, o.at - w / 2],
            [X, 0, o.at + w / 2],
            [X, h, o.at + w / 2],
            [X, h, o.at - w / 2],
          ];
        })();
  const open = state === "open" || state === "broken";
  const frame = pts.map(([X, Y, Z]) => project(v, X, Y, Z));
  const centre = project(v, o.side === "back" ? o.at : o.side === "left" ? 0 : v.W, 1.05, o.side === "back" ? 0 : o.at);
  const top = project(v, o.side === "back" ? o.at : o.side === "left" ? 0 : v.W, h + 0.15, o.side === "back" ? 0 : o.at);
  const p = frame.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ");
  // The door leaf swings into the room: drawn as the opening narrowed toward its hinge.
  const hinge = [frame[0], frame[3]];
  const leaf = open ? `${hinge[0].x},${hinge[0].y} ${hinge[0].x + (frame[1].x - frame[0].x) * 0.28},${hinge[0].y + 6} ${hinge[1].x + (frame[2].x - frame[3].x) * 0.28},${hinge[1].y - 4} ${hinge[1].x},${hinge[1].y}` : "";
  const isExit = o.object.kind === "exit";
  const secret = o.object.model === "secret-door";
  return (
    <g
      className={`sc-obj${hover ? " sc-selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`${o.object.name}: ${label}`}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
    >
      <polygon points={p} fill={open ? (isExit ? "#1a2230" : "#020203") : secret ? "#3a2c26" : "#4b3322"} stroke={secret ? "#2a1d18" : "#22170f"} strokeWidth={Math.max(2, centre.s * 0.06)} />
      {open && <polygon points={p} fill="url(#sc-dark)" opacity="0.7" />}
      {!open && !secret && (
        <g>
          <polygon points={frame.map((q, i) => `${(q.x + (centre.x - q.x) * 0.22).toFixed(1)},${(q.y + (centre.y - q.y) * (i < 2 ? 0.12 : 0.1)).toFixed(1)}`).join(" ")} fill="none" stroke="#2e2015" strokeWidth={Math.max(1, centre.s * 0.02)} />
          <circle cx={centre.x + (frame[1].x - frame[0].x) * 0.32} cy={centre.y} r={Math.max(2, centre.s * 0.035)} fill="#b59a5a" />
        </g>
      )}
      {open && <polygon points={leaf} fill={state === "broken" ? "#3a2618" : "#5a3d28"} opacity="0.95" />}
      {state === "broken" && <polyline points={`${frame[0].x},${frame[0].y - 20} ${frame[0].x + 8},${frame[0].y - 34} ${frame[0].x + 2},${frame[0].y - 48}`} stroke="#c9b08a" strokeWidth="2" fill="none" />}
      {state === "locked" && (
        <g transform={`translate(${centre.x.toFixed(1)} ${centre.y.toFixed(1)}) scale(${(centre.s / 100).toFixed(3)})`}>
          <path d="M-30 -18 L30 18 M-30 18 L30 -18" stroke="#6a6a6a" strokeWidth="5" strokeDasharray="7 3" />
          <rect x="-9" y="2" width="18" height="15" rx="2" fill="#8a7a4a" />
          <path d="M-6 2 L-6 -6 C-6 -12 6 -12 6 -6 L6 2" stroke="#8a7a4a" strokeWidth="3.5" fill="none" />
        </g>
      )}
      {(hover || isExit) && (
        <g transform={`translate(${top.x.toFixed(0)} ${Math.max(24, top.y).toFixed(0)})`} pointerEvents="none">
          <rect x={-(label.length * 7.4) / 2 - 10} y="-16" width={label.length * 7.4 + 20} height="24" rx="12" fill="#0b0a0d" opacity={hover ? 0.88 : 0.55} stroke={hover ? "#d6a55a" : "#2e2935"} />
          <text textAnchor="middle" y="1" fill={hover ? "#ece6da" : "#a39d94"} fontSize="14" fontFamily="var(--font-sans)">
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

function LightPool({ x, y, s }: { x: number; y: number; s: number }) {
  return <ellipse cx={x} cy={y} rx={Math.min(800, s * 2.4)} ry={Math.min(260, s * 0.75)} fill="url(#sc-pool)" style={{ mixBlendMode: "screen" }} pointerEvents="none" className="sc-lantern" />;
}

function Atmosphere({ v, fog, exterior }: { v: RoomView; fog: string; exterior: boolean }) {
  const back = project(v, 0, 0, 0);
  const dust = useMemo(() => Array.from({ length: 26 }, (_, i) => ({ x: (i * 397) % VIEW_W, y: 120 + ((i * 211) % 640), r: 1 + (i % 3), d: 6 + (i % 7) * 1.5, delay: -(i % 9) })), []);
  return (
    <g>
      <rect x="-200" y={back.y - 260} width={VIEW_W + 400} height="360" fill="url(#sc-fog)" opacity={exterior ? 0.7 : 0.45} />
      <ellipse cx="400" cy={back.y + 40} rx="520" ry="70" fill={fog} opacity="0.35" filter="url(#sc-blur)" className="sc-drift" />
      <ellipse cx="1200" cy={back.y + 120} rx="600" ry="80" fill={fog} opacity="0.3" filter="url(#sc-blur)" className="sc-drift sc-drift-b" />
      {dust.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#e8dcc4" opacity="0.25" className="sc-dust" style={{ animationDuration: `${d.d}s`, animationDelay: `${d.delay}s` }} />
      ))}
    </g>
  );
}

function Outside({ v, map, template, placeKind, placeName, facade, rectX }: { v: RoomView; map: MapDefinition; template: TemplateId; placeKind: "escola" | "casarao"; placeName: string; facade: { x0: number; x1: number }; rectX: number }) {
  const sitio = template === "ext-sitio";
  const X0 = facade.x0 - rectX;
  const X1 = facade.x1 - rectX;
  const base = project(v, X0, 0, 0);
  const far = project(v, 0, 0, -14);
  const sky = map.ambience.sky;
  const skyline = useMemo(() => {
    let d = `M0 ${far.y}`;
    let x = 0;
    let i = 0;
    while (x < VIEW_W) {
      const w = 40 + ((i * 73) % 90);
      const h = sitio ? 20 + ((i * 37) % 50) : 40 + ((i * 53) % 130);
      d += sitio ? ` Q${x + w / 2} ${far.y - h} ${x + w} ${far.y}` : ` L${x} ${far.y - h} L${x + w} ${far.y - h}`;
      x += w;
      i++;
    }
    return `${d} L${VIEW_W} ${far.y} Z`;
  }, [far.y, sitio]);
  const ground = poly(v, [[-40, 0, -14], [v.W + 40, 0, -14], [v.W + 40, 0, v.Znear], [-40, 0, v.Znear]]);
  const walk = poly(v, [[-40, 0, 0], [v.W + 40, 0, 0], [v.W + 40, 0, 1.3], [-40, 0, 1.3]]);
  const lamp = project(v, v.W * 0.78, 0, 1.4);
  const lampTop = project(v, v.W * 0.78, 4.6, 1.4);
  const fw = X1 - X0;
  return (
    <g>
      <rect width={VIEW_W} height={VIEW_H} fill={sky} />
      <rect width={VIEW_W} height={far.y} fill="url(#sc-fog)" opacity="0.6" />
      {Array.from({ length: 40 }, (_, i) => (
        <circle key={i} cx={(i * 337) % VIEW_W} cy={(i * 131) % Math.max(60, far.y - 120)} r={i % 5 === 0 ? 1.4 : 0.8} fill="#cfd6e6" opacity={0.15 + (i % 4) * 0.08} />
      ))}
      <circle cx={VIEW_W * 0.18} cy={90} r="34" fill="#d9dccf" opacity="0.75" />
      <circle cx={VIEW_W * 0.18 + 12} cy={84} r="32" fill={sky} opacity="0.9" />
      <path d={skyline} fill={sitio ? "#0c120e" : "#0b0d12"} />
      <polygon points={ground} fill={sitio ? "#2a2318" : "#1d1e22"} />
      <polygon points={ground} fill="url(#sc-grime)" opacity="0.7" />
      {!sitio && <polygon points={walk} fill="#34332f" />}
      {!sitio && <polyline points={poly(v, [[-40, 0, 1.3], [v.W + 40, 0, 1.3]])} stroke="#4a4842" strokeWidth="4" fill="none" />}
      {!sitio && Array.from({ length: 8 }, (_, i) => <polygon key={i} points={poly(v, [[i * 3, 0, 3.6], [i * 3 + 1.4, 0, 3.6], [i * 3 + 1.4, 0, 3.75], [i * 3, 0, 3.75]])} fill="#6a6658" opacity="0.5" />)}
      <g transform={`translate(${base.x.toFixed(1)} ${base.y.toFixed(1)}) scale(${base.s.toFixed(3)})`}>{placeKind === "escola" ? <SchoolFacade w={fw} name={placeName} /> : <ManorFacade w={fw} />}</g>
      {/* The one working street lamp */}
      <polygon points={`${lampTop.x},${lampTop.y} ${lamp.x - lamp.s * 1.6},${lamp.y} ${lamp.x + lamp.s * 1.6},${lamp.y}`} fill="url(#sc-cone)" className="sc-buzz-soft" />
      <ellipse cx={lamp.x} cy={lamp.y} rx={lamp.s * 1.8} ry={lamp.s * 0.4} fill="#ffe2a8" opacity="0.12" />
      <path d={`M${lamp.x} ${lamp.y} L${lampTop.x} ${lampTop.y} l${-lamp.s * 0.4} 0`} stroke="#22252a" strokeWidth={Math.max(3, lamp.s * 0.08)} fill="none" />
      <circle cx={lampTop.x - lamp.s * 0.4} cy={lampTop.y + 4} r={Math.max(4, lamp.s * 0.1)} fill="#ffe9b8" />
    </g>
  );
}

function SchoolFacade({ w, name }: { w: number; name: string }) {
  const H = 6.2;
  const cols = Math.max(2, Math.floor(w / 1.6));
  return (
    <g>
      <rect x="0" y={-H} width={w} height={H} fill="#7a7466" />
      <rect x="0" y={-H} width={w} height={H} fill="url(#sc-grime)" />
      <rect x="0" y="-1.1" width={w} height="1.1" fill="#3a5242" />
      <rect x="-0.1" y={-H - 0.15} width={w + 0.2} height="0.18" fill="#4a463c" />
      {[1.3, 4.0].map((y) =>
        Array.from({ length: cols }, (_, i) => {
          const x = (i + 0.5) * (w / cols) - 0.55;
          if (y < 2 && Math.abs(x + 0.55 - w / 2) < 1) return null;
          return (
            <g key={`${y}.${i}`}>
              <rect x={x} y={-y - 1.3} width="1.1" height="1.3" fill={(i * 7 + y) % 5 < 1 ? "#3a3420" : "#1c2634"} />
              <rect x={x} y={-y - 1.3} width="1.1" height="1.3" fill="url(#sc-wire)" opacity="0.35" />
              <path d={`M${x + 0.55} ${-y - 1.3} L${x + 0.55} ${-y}`} stroke="#2a2a28" strokeWidth="0.05" />
            </g>
          );
        }),
      )}
      <rect x={w / 2 - 1.4} y={-3.0} width="2.8" height="0.42" fill="#d9d2bf" opacity="0.85" />
      <text x={w / 2} y={-2.7} fontSize="0.22" textAnchor="middle" fill="#2a2a24" fontFamily="var(--font-sans)" fontWeight="700">
        {name.toUpperCase().slice(0, 34)}
      </text>
      <path d={`M0.4 -0.4 q0.4 -0.6 0.9 -0.1 t0.8 -0.3 M${w - 2} -0.6 q0.3 -0.5 0.7 0 q0.2 0.3 0.6 -0.2`} stroke="#b84a8a" strokeWidth="0.09" fill="none" opacity="0.7" />
      <path d={`M${w * 0.3} -0.5 l0.5 -0.4 l0.3 0.4 l0.4 -0.5`} stroke="#4a9ab8" strokeWidth="0.08" fill="none" opacity="0.6" />
    </g>
  );
}

function ManorFacade({ w }: { w: number }) {
  const H = 5.6;
  const cols = Math.max(2, Math.floor(w / 1.8));
  return (
    <g>
      <path d={`M-0.3 ${-H} L${w / 2} ${-H - 1.6} L${w + 0.3} ${-H} Z`} fill="#4a2a20" />
      <rect x="0" y={-H} width={w} height={H} fill="#8a7a62" />
      <rect x="0" y={-H} width={w} height={H} fill="url(#sc-grime)" />
      <rect x="-0.2" y="-3.0" width={w + 0.4} height="0.14" fill="#5a4a38" />
      {Array.from({ length: Math.floor(w / 0.3) }, (_, i) => (
        <rect key={i} x={i * 0.3 + 0.1} y="-3.6" width="0.06" height="0.6" fill="#5a4a38" />
      ))}
      <rect x="-0.2" y="-3.62" width={w + 0.4} height="0.06" fill="#5a4a38" />
      {[0.9, 3.4].map((y) =>
        Array.from({ length: cols }, (_, i) => {
          const x = (i + 0.5) * (w / cols) - 0.45;
          if (y < 2 && Math.abs(x + 0.45 - w / 2) < 1) return null;
          return (
            <g key={`${y}.${i}`}>
              <path d={`M${x} ${-y} L${x} ${-y - 1.35} Q${x + 0.45} ${-y - 1.65} ${x + 0.9} ${-y - 1.35} L${x + 0.9} ${-y} Z`} fill="#1a1612" />
              <path d={`M${x - 0.05} ${-y - 0.3} L${x + 0.95} ${-y - 1.0} M${x - 0.05} ${-y - 1.0} L${x + 0.95} ${-y - 0.4}`} stroke="#6a5038" strokeWidth="0.12" />
            </g>
          );
        }),
      )}
      {Array.from({ length: 5 }, (_, i) => (
        <path key={i} d={`M${0.3 + i * (w / 5)} -3.7 q0.2 -0.3 0.5 -0.1`} stroke="#4a5a32" strokeWidth="0.08" fill="none" opacity="0.7" />
      ))}
    </g>
  );
}
