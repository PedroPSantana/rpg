import type { ReactNode } from "react";
import type { TemplateId } from "@/modules/world/scenes";

/**
 * Look of each room: materials and the set dressing on its walls. Keyed by
 * template and area id, like the textual scene catalog, so every room of
 * every generated campaign has its own art direction.
 */
export interface RoomStyle {
  wall: string;
  wallShade: string;
  wainscot: string | null;
  wainscotH: number;
  floorA: string;
  floorB: string;
  floor: "checker" | "planks" | "concrete" | "tiles" | "dirt" | "asphalt";
  ceiling: string | null;
  furniture: string;
  back: (W: number, H: number) => ReactNode;
  /** Decorations on the side walls, as depth spans. */
  side?: "windows" | "lockers" | "portraits" | "shelves" | null;
}

function Chalkboard({ W }: { W: number }) {
  const w = Math.min(3.4, W * 0.62);
  const x = (W - w) / 2;
  return (
    <g>
      <rect x={x - 0.06} y={-2.15} width={w + 0.12} height={1.22} fill="#5a4a36" />
      <rect x={x} y={-2.1} width={w} height={1.12} fill="#1f2e27" />
      <path d={`M${x + 0.3} -1.8 q0.3 -0.1 0.6 0 t0.6 0 M${x + 0.3} -1.55 l${w * 0.4} 0 M${x + 0.35} -1.3 q0.4 0.08 0.8 -0.02`} stroke="#cfd6cf" strokeWidth="0.02" fill="none" opacity="0.5" />
      <path d={`M${x + w * 0.6} -1.75 l0.5 0.45 M${x + w * 0.6 + 0.5} -1.75 l-0.5 0.45`} stroke="#d9d0c0" strokeWidth="0.025" opacity="0.35" />
      <rect x={x} y={-0.98} width={w} height="0.04" fill="#6e5a40" />
    </g>
  );
}

function Window({ x, w = 1, y = 1.0, h = 1.1, bars = true, glow = "#2b3b52" }: { x: number; w?: number; y?: number; h?: number; bars?: boolean; glow?: string }) {
  return (
    <g>
      <rect x={x - 0.05} y={-y - h - 0.05} width={w + 0.1} height={h + 0.1} fill="#2a2620" />
      <rect x={x} y={-y - h} width={w} height={h} fill={glow} />
      <rect x={x} y={-y - h} width={w} height={h} fill="url(#sc-wire)" opacity="0.5" />
      <path d={`M${x + w / 2} ${-y - h} L${x + w / 2} ${-y} M${x} ${-y - h / 2} L${x + w} ${-y - h / 2}`} stroke="#1c1a17" strokeWidth="0.04" />
      {bars && Array.from({ length: 4 }, (_, i) => <path key={i} d={`M${x + ((i + 0.5) * w) / 4} ${-y - h} L${x + ((i + 0.5) * w) / 4} ${-y}`} stroke="#141312" strokeWidth="0.025" />)}
    </g>
  );
}

function Shelves({ W, books }: { W: number; books?: boolean }) {
  const n = Math.max(1, Math.floor(W / 1.1));
  const w = W / n;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <g key={i} transform={`translate(${i * w + 0.05} 0)`}>
          <rect x="0" y="-2.4" width={w - 0.1} height="2.4" fill={books ? "#2a1c13" : "#3f444b"} />
          {[0.45, 0.95, 1.45, 1.95].map((y, r) => (
            <g key={y}>
              <rect x="0.03" y={-y} width={w - 0.16} height="0.03" fill={books ? "#4a3322" : "#6a7078"} />
              {Array.from({ length: Math.floor((w - 0.2) / (books ? 0.09 : 0.3)) }, (_, j) =>
                books ? (
                  <rect key={j} x={0.06 + j * 0.09} y={-y - 0.4 + ((r * 5 + j * 3 + i) % 5) * 0.02} width="0.07" height={0.4 - ((r * 5 + j * 3 + i) % 5) * 0.02} fill={["#5b2a22", "#2b3a45", "#4b4a2a", "#6b5a3a", "#3a2a40"][(r + j + i) % 5]} opacity={(j + r) % 7 === 3 ? 0 : 1} />
                ) : (
                  <rect key={j} x={0.06 + j * 0.3} y={-y - 0.3 + ((r + j) % 2) * 0.05} width="0.26" height={0.3 - ((r + j) % 2) * 0.05} fill={(r + j + i) % 3 ? "#8a7254" : "#a28c66"} transform={(r + j) % 4 === 1 ? `rotate(-8 ${0.06 + j * 0.3} ${-y})` : ""} />
                ),
              )}
            </g>
          ))}
        </g>
      ))}
    </g>
  );
}

function Frame({ x, y, w, h, children }: { x: number; y: number; w: number; h: number; children?: ReactNode }) {
  return (
    <g>
      <rect x={x - 0.05} y={-y - h - 0.05} width={w + 0.1} height={h + 0.1} fill="#3a2a1a" />
      <rect x={x} y={-y - h} width={w} height={h} fill="#26201b" />
      {children}
    </g>
  );
}

function CorkBoard({ x, w }: { x: number; w: number }) {
  return (
    <g>
      <rect x={x} y={-2.0} width={w} height="0.85" fill="#9a7a52" stroke="#5a4530" strokeWidth="0.04" />
      {Array.from({ length: Math.floor(w / 0.35) }, (_, i) => (
        <rect key={i} x={x + 0.08 + i * 0.35} y={-1.92 + (i % 3) * 0.12} width="0.26" height="0.34" fill={i % 4 === 2 ? "#c9b87a" : "#d6cdb6"} transform={`rotate(${(i % 3) - 1} ${x + i * 0.35} -1.7)`} />
      ))}
    </g>
  );
}

function Altar({ W }: { W: number }) {
  const c = W / 2;
  return (
    <g>
      <rect x={c - 0.55} y="-2.5" width="1.1" height="1.25" rx="0.55" fill="#2a2440" />
      {[
        ["#5a2a6a", -0.3],
        ["#2a4a6a", 0],
        ["#6a5a2a", 0.3],
      ].map(([col, dx], i) => (
        <rect key={i} x={c + (dx as number) - 0.13} y="-2.3" width="0.26" height="0.9" fill={col as string} opacity="0.7" />
      ))}
      <path d={`M${c - 0.55} -1.85 L${c + 0.55} -1.85`} stroke="#1c1830" strokeWidth="0.04" />
      <rect x={c - 0.7} y="-0.95" width="1.4" height="0.95" fill="#3e2a1b" />
      <path d={`M${c - 0.72} -0.95 L${c + 0.72} -0.95 L${c + 0.68} -0.6 L${c - 0.68} -0.6 Z`} fill="#d8d0bf" opacity="0.85" />
      {[-0.4, 0.4].map((dx) => (
        <g key={dx}>
          <rect x={c + dx - 0.07} y="-1.25" width="0.14" height="0.3" fill="#4a3a2a" />
          <rect x={c + dx - 0.06} y="-1.25" width="0.12" height="0.02" fill="#000" transform={`rotate(180 ${c + dx} -1.1)`} />
        </g>
      ))}
    </g>
  );
}

function Mirror({ W }: { W: number }) {
  const c = W / 2;
  return (
    <g>
      <rect x={c - 0.55} y="-2.35" width="1.1" height="1.3" rx="0.12" fill="#5a4630" />
      <rect x={c - 0.47} y="-2.27" width="0.94" height="1.14" rx="0.08" fill="#55606a" />
      <path d={`M${c - 0.3} -2.2 L${c + 0.1} -1.4`} stroke="#c9d3dc" strokeWidth="0.02" opacity="0.4" />
      <ellipse cx={c + 0.15} cy="-1.6" rx="0.25" ry="0.15" fill="#2a2520" opacity="0.5" />
    </g>
  );
}

function Stove({ W }: { W: number }) {
  return (
    <g>
      {Array.from({ length: Math.ceil(W / 0.3) }, (_, i) =>
        Array.from({ length: 4 }, (_, j) => <rect key={`${i}-${j}`} x={i * 0.3} y={-1.4 - j * 0.3} width="0.29" height="0.29" fill={(i + j) % 2 ? "#7a8c8a" : "#c8c8bc"} opacity="0.35" />),
      )}
      {[-0.6, -0.2, 0.25].map((dx) => (
        <g key={dx} transform={`translate(${W / 2 + dx} -2.1)`}>
          <path d="M0 0 L0 0.2" stroke="#222" strokeWidth="0.02" />
          <ellipse cx="0" cy="0.32" rx="0.16" ry="0.12" fill="#1d1d1d" />
        </g>
      ))}
    </g>
  );
}

function Bed({ W }: { W: number }) {
  const c = W / 2;
  return (
    <g>
      <rect x={c - 0.8} y="-1.4" width="1.6" height="0.06" fill="#3a3a3a" />
      {Array.from({ length: 6 }, (_, i) => <path key={i} d={`M${c - 0.75 + i * 0.3} -1.35 L${c - 0.75 + i * 0.3} -0.6`} stroke="#3a3a3a" strokeWidth="0.03" />)}
      <path d={`M${c - 0.85} -0.6 L${c + 0.85} -0.6 L${c + 0.9} -0.35 L${c - 0.9} -0.35 Z`} fill="#b8b0a0" />
      <rect x={W - 1.2} y="-1.8" width="0.7" height="0.9" fill="#d8d0c0" opacity="0.8" />
    </g>
  );
}

function Hoop({ W }: { W: number }) {
  return (
    <g>
      <path d={`M0 -1.1 L${W} -1.1`} stroke="#6a6a6a" strokeWidth="0.05" />
      {Array.from({ length: Math.ceil(W / 0.25) }, (_, i) => (
        <path key={i} d={`M${i * 0.25} -1.1 L${i * 0.25 + 0.25} -2.6 M${i * 0.25 + 0.25} -1.1 L${i * 0.25} -2.6`} stroke="#4a4a4a" strokeWidth="0.012" />
      ))}
      <rect x={W / 2 - 0.45} y="-3.2" width="0.9" height="0.6" fill="#d8d8d0" opacity="0.8" />
      <ellipse cx={W / 2} cy="-2.6" rx="0.22" ry="0.05" fill="none" stroke="#b5532a" strokeWidth="0.03" />
    </g>
  );
}

const SCHOOL: Record<string, Partial<RoomStyle>> = {
  "sala-aula": { furniture: "desk", side: "windows", back: (W) => <Chalkboard W={W} /> },
  corredor: { furniture: "desk", side: "lockers", back: (W) => <Window x={W / 2 - 0.6} w={1.2} glow="#1e2c40" /> },
  diretoria: {
    furniture: "cabinet",
    side: null,
    back: (W) => (
      <g>
        <Window x={W * 0.15} w={1} glow="#1e2a3a" />
        <CorkBoard x={W * 0.55} w={Math.min(1.6, W * 0.35)} />
        <circle cx={W * 0.82} cy="-2.35" r="0.18" fill="#d6cfbd" stroke="#2a2520" strokeWidth="0.03" />
        <path d={`M${W * 0.82} -2.35 l0 -0.12 M${W * 0.82} -2.35 l0.08 0.05`} stroke="#1a1714" strokeWidth="0.02" />
      </g>
    ),
  },
  laboratorio: {
    furniture: "desk",
    side: "shelves",
    floor: "tiles",
    back: (W) => (
      <g>
        <Stove W={W} />
        <rect x={W * 0.1} y="-2.4" width="0.7" height="0.95" fill="#d6cfa8" opacity="0.6" />
        {Array.from({ length: 12 }, (_, i) => <rect key={i} x={W * 0.1 + 0.05 + (i % 4) * 0.16} y={-2.32 + Math.floor(i / 4) * 0.28} width="0.13" height="0.2" fill={["#a33", "#36a", "#3a6", "#aa3"][i % 4]} opacity="0.5" />)}
      </g>
    ),
  },
  patio: { furniture: "bench", floor: "concrete", ceiling: null, side: null, back: (W) => <Hoop W={W} /> },
  biblioteca: { furniture: "books", side: "shelves", back: (W) => <Shelves W={W} books /> },
  covil: { furniture: "shelf", side: "shelves", back: (W) => <Shelves W={W} /> },
};

const MANOR: Record<string, Partial<RoomStyle>> = {
  corredor: {
    furniture: "crate",
    side: "portraits",
    back: (W) => (
      <Frame x={W / 2 - 0.35} y={1.2} w={0.7} h={0.9}>
        <ellipse cx={W / 2} cy="-1.75" rx="0.18" ry="0.24" fill="#4a3a30" />
      </Frame>
    ),
  },
  biblioteca: { furniture: "books", side: "shelves", back: (W) => <Shelves W={W} books /> },
  capela: { furniture: "bench", side: null, back: (W) => <Altar W={W} /> },
  covil: { furniture: "cabinet", side: null, back: (W) => <Bed W={W} /> },
  cozinha: { furniture: "stove", floor: "tiles", side: "windows", back: (W) => <Stove W={W} /> },
  sala: { furniture: "sofa", side: "portraits", back: (W) => <Mirror W={W} /> },
};

export function roomStyle(template: TemplateId, areaId: string): RoomStyle {
  const school = template === "int-escola";
  const base: RoomStyle = school
    ? { wall: "#7d7768", wallShade: "#5b564b", wainscot: "#34503f", wainscotH: 1.1, floorA: "#58544a", floorB: "#3a3832", floor: "checker", ceiling: "#3a3934", furniture: "desk", back: () => null, side: null }
    : { wall: "#5a4440", wallShade: "#3f302d", wainscot: "#3a281c", wainscotH: 0.9, floorA: "#4a3424", floorB: "#3a281b", floor: "planks", ceiling: "#2a211c", furniture: "crate", back: () => null, side: null };
  const extra = (school ? SCHOOL : MANOR)[areaId] ?? {};
  const style = { ...base, ...extra };
  if (style.floor === "tiles") Object.assign(style, { floorA: "#8a8a80", floorB: "#6a6a62" });
  if (style.floor === "concrete") Object.assign(style, { floorA: "#4e4e4a", floorB: "#45453f", wainscot: "#3c3c38" });
  return style;
}
