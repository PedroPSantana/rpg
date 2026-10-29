import type { ReactNode } from "react";
import { Bust, lookOf } from "./portrait";

/**
 * Hand-drawn props for the 2.5D scene. Every sprite is drawn in tile units
 * (1 ≈ one metre) with its origin where it touches the floor and y pointing
 * up as negative numbers; the stage scales it to its depth.
 */
export interface SpriteInfo {
  model: string;
  kind: string;
  state: string;
  name: string;
  /** Visible height, used to place labels and hit areas. */
  height?: number;
  role?: string;
  element?: string;
  known?: boolean;
}

const WOOD = "#5a3d28";
const WOOD_D = "#3e2a1b";
const METAL = "#59606a";
const METAL_D = "#3a3f46";
const PAPER = "#d8cfba";

function Shadow({ w = 0.8, o = 0.45 }: { w?: number; o?: number }) {
  return <ellipse cx="0" cy="0" rx={w / 2} ry={w / 7} fill="#000" opacity={o} />;
}

function Table({ w = 1.1, h = 0.78, top = WOOD, children }: { w?: number; h?: number; top?: string; children?: ReactNode }) {
  return (
    <g>
      <Shadow w={w * 1.1} />
      <rect x={-w / 2 + 0.06} y={-h} width="0.06" height={h} fill={WOOD_D} />
      <rect x={w / 2 - 0.12} y={-h} width="0.06" height={h} fill={WOOD_D} />
      <rect x={-w / 2} y={-h - 0.06} width={w} height="0.08" fill={top} />
      <rect x={-w / 2} y={-h + 0.02} width={w} height="0.03" fill="#000" opacity="0.3" />
      <g transform={`translate(0 ${-h - 0.06})`}>{children}</g>
    </g>
  );
}

function Flame({ x = 0, y = 0, k = 1 }: { x?: number; y?: number; k?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`} className="sc-flame">
      <ellipse cx="0" cy="-0.05" rx="0.12" ry="0.12" fill="#ffb347" opacity="0.25" />
      <path d="M0 -0.11 C0.03 -0.06 0.03 -0.02 0 0 C-0.03 -0.02 -0.03 -0.06 0 -0.11 Z" fill="#ffd27a" />
    </g>
  );
}

function Person({ name, role, calm, state }: { name: string; role?: string; calm?: boolean; state: string }) {
  const look = lookOf(name, role, calm);
  const h = look.age === "old" ? 1.62 : 1.72;
  const k = 0.55 / 100;
  return (
    <g>
      <Shadow w={0.6} o={0.5} />
      {/* Legs and body */}
      <path d={`M-0.13 0 L-0.12 ${-h * 0.46} L0.12 ${-h * 0.46} L0.13 0 L0.03 0 L0 ${-h * 0.36} L-0.03 0 Z`} fill="#24222a" />
      <path d={`M-0.24 ${-h * 0.44} C-0.26 ${-h * 0.62} -0.22 ${-h * 0.76} -0.15 ${-h * 0.8} L0.15 ${-h * 0.8} C0.22 ${-h * 0.76} 0.26 ${-h * 0.62} 0.24 ${-h * 0.44} Z`} fill={look.coat} />
      {look.accessory === "apron" && <path d={`M-0.15 ${-h * 0.42} L-0.13 ${-h * 0.72} L0.13 ${-h * 0.72} L0.15 ${-h * 0.42} Z`} fill="#cfc6b2" opacity="0.8" />}
      <path d={`M-0.25 ${-h * 0.76} L-0.3 ${-h * 0.5}`} stroke={look.coat} strokeWidth="0.09" strokeLinecap="round" />
      <path d={`M0.25 ${-h * 0.76} L0.3 ${-h * 0.5}`} stroke={look.coat} strokeWidth="0.09" strokeLinecap="round" />
      <circle cx="-0.3" cy={-h * 0.49} r="0.045" fill={look.skinShade} />
      <circle cx="0.3" cy={-h * 0.49} r="0.045" fill={look.skinShade} />
      {/* Head from the portrait, scaled down */}
      <g transform={`translate(${-50 * k} ${-h - 0.04}) scale(${k})`}>
        <Bust look={look} gaze={state === "talking" ? 0 : -2} />
      </g>
    </g>
  );
}

const ELEMENT_ART: Record<string, string> = { sangue: "#b3261e", morte: "#9a9a9a", conhecimento: "#d9b44a", energia: "#9b6bff", medo: "#e8e8f0" };

function Threat({ element = "morte", known, state }: { element?: string; known?: boolean; state: string }) {
  if (state === "defeated" || state === "banished") {
    return (
      <g opacity="0.8">
        <ellipse rx="0.6" ry="0.12" fill="#1a1716" />
        <path d="M-0.4 -0.02 q0.2 -0.12 0.4 -0.02 q0.2 -0.1 0.35 0.01" stroke="#4a4442" strokeWidth="0.03" fill="none" />
      </g>
    );
  }
  if (!known) {
    // Before the encounter: only a darker patch of dark, and the impression of being watched.
    return (
      <g className="sc-lurk">
        <ellipse cx="0" cy="-0.9" rx="0.55" ry="0.95" fill="url(#sc-dark)" />
        <circle cx="-0.08" cy="-1.35" r="0.025" fill="#d8d0c0" opacity="0.55" className="sc-blink" />
        <circle cx="0.08" cy="-1.35" r="0.025" fill="#d8d0c0" opacity="0.55" className="sc-blink" />
      </g>
    );
  }
  const c = ELEMENT_ART[element] ?? "#9a9a9a";
  return (
    <g className="sc-threat">
      <Shadow w={1.1} o={0.6} />
      <ellipse cx="0" cy="-1" rx="0.75" ry="1.05" fill={c} opacity="0.12" />
      <path d="M-0.35 0 C-0.5 -0.6 -0.45 -1.3 -0.2 -1.75 C-0.1 -1.95 0.1 -1.95 0.2 -1.75 C0.45 -1.3 0.5 -0.6 0.35 0 Z" fill="#0d0b0e" />
      {element === "morte" && (
        <g stroke={c} strokeWidth="0.035" strokeLinecap="round">
          <circle cx="0" cy="-1.25" r="0.28" fill="none" opacity="0.8" />
          <path d="M0 -1.25 L0 -1.45 M0 -1.25 L0.14 -1.18" />
          <path d="M-0.35 -0.9 L-0.75 -0.45 M0.35 -0.9 L0.8 -0.55" opacity="0.7" />
        </g>
      )}
      {element === "sangue" && <path d="M-0.3 -0.8 C-0.7 -0.6 -0.8 -0.2 -0.9 0 M0.3 -0.8 C0.7 -0.7 0.8 -0.3 0.95 -0.05 M0 -1.6 C0.1 -1.9 0.3 -2 0.4 -2.1" stroke={c} strokeWidth="0.06" fill="none" strokeLinecap="round" />}
      {element === "conhecimento" && (
        <g fill="none" stroke={c} strokeWidth="0.03">
          <circle cx="0" cy="-1.1" r="0.55" strokeDasharray="0.08 0.06" />
          <path d="M-0.2 -1.2 L0 -1.45 L0.2 -1.2 L0 -0.95 Z" />
        </g>
      )}
      {element === "energia" && <path d="M-0.5 -1.6 L-0.15 -1.2 L-0.4 -1 L0.1 -0.5 M0.5 -1.5 L0.2 -1.1 L0.45 -0.9" stroke={c} strokeWidth="0.04" fill="none" className="sc-glitch" />}
      {element === "medo" && <path d="M-0.3 -1.5 q0.3 0.25 0.6 0" stroke={c} strokeWidth="0.03" fill="none" />}
      <circle cx="-0.09" cy="-1.5" r="0.04" fill={c} />
      <circle cx="0.09" cy="-1.5" r="0.04" fill={c} />
    </g>
  );
}

function Door({ state }: { state: string }) {
  return <rect x="-0.4" y="-2" width="0.8" height="2" fill={state === "open" ? "#000" : WOOD} />;
}

export function spriteHeight(info: SpriteInfo) {
  switch (info.model) {
    case "npc":
    case "npc-calm":
      return 1.8;
    case "clock":
      return 2.15;
    case "board":
      return 1.7;
    case "relic":
    case "drawer":
      return 1.1;
    case "table":
    case "manuscript":
    case "book":
    case "radio":
      return 1;
    case "leaves":
      return 1.5;
    default:
      if (info.model.startsWith("threat")) return 1.9;
      return 0.5;
  }
}

/** The drawing for one map object. */
export function Sprite({ info }: { info: SpriteInfo }) {
  const { model, state } = info;
  switch (model) {
    case "npc":
    case "npc-calm":
      return <Person name={info.name} role={info.role} calm={model === "npc-calm"} state={state} />;
    case "papers":
      return (
        <g>
          <Shadow w={0.7} o={0.3} />
          {[-0.22, 0.05, 0.25, -0.05].map((x, i) => (
            <rect key={i} x={x - 0.12} y={-0.03 - i * 0.012} width="0.24" height="0.06" fill={PAPER} transform={`skewX(${i * 18 - 20})`} opacity={0.9 - i * 0.1} />
          ))}
          <rect x="-0.15" y="-0.2" width="0.3" height="0.16" fill="#7a6a52" />
          <rect x="-0.13" y="-0.23" width="0.26" height="0.04" fill={PAPER} />
        </g>
      );
    case "book":
      return (
        <g>
          <Shadow w={0.6} />
          <path d="M-0.05 0 L-0.08 -0.75 L0.08 -0.75 L0.05 0 Z" fill={WOOD_D} />
          <path d="M-0.3 -0.78 L0.3 -0.78 L0.26 -0.9 L-0.26 -0.9 Z" fill={WOOD} />
          <path d="M-0.26 -0.9 L0 -0.86 L0 -0.98 L-0.24 -1.0 Z" fill="#6b2f22" />
          <path d="M0.26 -0.9 L0 -0.86 L0 -0.98 L0.24 -1.0 Z" fill="#7a3726" />
          <path d="M-0.22 -0.93 L-0.02 -0.9 M0.02 -0.9 L0.22 -0.93" stroke={PAPER} strokeWidth="0.01" />
        </g>
      );
    case "wall-mark":
    case "stain":
      return (
        <g>
          <ellipse rx="0.5" ry="0.13" fill={model === "stain" ? "#2a0d0b" : "#1b1612"} opacity="0.8" />
          <ellipse cx="0.12" cy="0.01" rx="0.25" ry="0.06" fill={model === "stain" ? "#3d1210" : "#2b241d"} opacity="0.8" />
          {model === "wall-mark" && <path d="M-0.4 0 L-0.1 -0.04 M-0.3 0.04 L0.05 0 M-0.2 0.07 L0.2 0.03" stroke="#6a5c4a" strokeWidth="0.015" />}
        </g>
      );
    case "candles":
      return (
        <g>
          <Shadow w={0.6} o={0.3} />
          {[
            [-0.15, 0.22],
            [0.02, 0.32],
            [0.16, 0.18],
            [-0.02, 0.14],
          ].map(([x, h], i) => (
            <g key={i}>
              <rect x={x - 0.025} y={-h} width="0.05" height={h} fill="#e8dfc8" />
              <Flame x={x} y={-h} k={0.9} />
            </g>
          ))}
        </g>
      );
    case "manuscript":
      return (
        <Table w={0.8} h={0.75}>
          <path d="M-0.28 -0.02 L0 0 L0 -0.06 L-0.26 -0.08 Z" fill={PAPER} />
          <path d="M0.28 -0.02 L0 0 L0 -0.06 L0.26 -0.08 Z" fill="#cbbf9f" />
          <path d="M-0.22 -0.05 L-0.04 -0.04 M0.04 -0.04 L0.22 -0.05" stroke="#3d2f22" strokeWidth="0.008" />
        </Table>
      );
    case "table":
      return (
        <Table w={1.2}>
          <rect x="-0.3" y="-0.06" width="0.25" height="0.06" fill={PAPER} />
          <rect x="0.1" y="-0.12" width="0.08" height="0.12" fill="#6e7b6a" />
        </Table>
      );
    case "relic":
      return (
        <g>
          <Shadow w={0.6} />
          <path d="M-0.18 0 L-0.12 -0.85 L0.12 -0.85 L0.18 0 Z" fill="#4a4540" />
          <rect x="-0.2" y="-0.9" width="0.4" height="0.06" fill="#5a544e" />
          <circle cx="0" cy="-1.0" r="0.09" fill={info.state === "destroyed" ? "#2a2522" : "#c9a75a"} className={info.state === "intact" || info.state === "activated" ? "sc-glow" : ""} />
        </g>
      );
    case "leaves":
      return (
        <g className="sc-float">
          <ellipse rx="0.5" ry="0.1" fill="#000" opacity="0.25" />
          {[
            [-0.3, -0.6, 20],
            [0.1, -0.9, -30],
            [0.3, -0.5, 60],
            [-0.1, -1.3, 10],
            [0.25, -1.2, -50],
            [-0.35, -1.05, 80],
            [0, -0.4, -10],
          ].map(([x, y, r], i) => (
            <path key={i} d="M0 0 C0.05 -0.04 0.1 -0.02 0.12 0 C0.1 0.02 0.05 0.04 0 0 Z" fill={i % 2 ? "#7a5a2a" : "#5e4a22"} transform={`translate(${x} ${y}) rotate(${r})`} />
          ))}
        </g>
      );
    case "gears":
      return (
        <g>
          <ellipse rx="0.55" ry="0.14" fill="none" stroke="#7a6a4a" strokeWidth="0.02" strokeDasharray="0.05 0.04" />
          {[
            [-0.25, 0, 0.09],
            [0.15, -0.02, 0.12],
            [0.35, 0.03, 0.06],
            [-0.05, 0.05, 0.07],
          ].map(([x, y, r], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(1 0.35)`}>
              <circle r={r} fill="none" stroke="#a88c4a" strokeWidth={r * 0.35} strokeDasharray={`${r * 0.3} ${r * 0.25}`} />
              <circle r={r * 0.6} fill="#6a5530" />
            </g>
          ))}
        </g>
      );
    case "clock":
      return (
        <g>
          <Shadow w={0.7} />
          <path d="M-0.28 0 L-0.28 -1.65 L-0.22 -2.15 L0.22 -2.15 L0.28 -1.65 L0.28 0 Z" fill={WOOD} />
          <path d="M-0.28 -1.65 L0.28 -1.65" stroke={WOOD_D} strokeWidth="0.03" />
          <circle cx="0" cy="-1.85" r="0.17" fill="#d9cfb4" />
          <path d="M0 -1.85 L0 -1.96 M0 -1.85 L0.07 -1.8" stroke="#1d1712" strokeWidth="0.02" strokeLinecap="round" />
          <rect x="-0.16" y="-1.5" width="0.32" height="1.2" fill="#1b130d" />
          <g className={info.state === "intact" ? "sc-still" : "sc-swing"} style={{ transformOrigin: "0px -1.45px" }}>
            <path d="M0 -1.45 L0 -0.65" stroke="#a88c4a" strokeWidth="0.015" />
            <circle cx="0" cy="-0.6" r="0.07" fill="#c9a75a" />
          </g>
          {info.state === "destroyed" && <path d="M-0.25 -1.2 L0.2 -0.4 M0.2 -1.3 L-0.1 -0.6" stroke="#c9c1ad" strokeWidth="0.02" />}
        </g>
      );
    case "cable":
      return (
        <g>
          <path d="M-0.5 0 C-0.3 -0.08 -0.1 0.06 0.1 -0.02 C0.3 -0.1 0.45 0.04 0.55 -0.03" stroke="#151515" strokeWidth="0.04" fill="none" />
          <ellipse cx="-0.15" cy="0" rx="0.18" ry="0.05" fill="none" stroke="#1b1b1b" strokeWidth="0.03" />
          <path d="M0.55 -0.03 l0.05 -0.06 l0.02 0.05 l0.06 -0.05" stroke="#9fd0ff" strokeWidth="0.015" fill="none" className="sc-spark" />
        </g>
      );
    case "board":
      return (
        <g>
          <Shadow w={0.9} />
          <path d="M-0.35 0 L-0.25 -1.7 M0.35 0 L0.25 -1.7 M0 0 L0 -0.6" stroke={WOOD_D} strokeWidth="0.04" />
          <rect x="-0.45" y="-1.65" width="0.9" height="0.7" fill="#8a6a46" stroke={WOOD_D} strokeWidth="0.03" />
          <rect x="-0.38" y="-1.58" width="0.22" height="0.16" fill={PAPER} transform="rotate(-4 -0.27 -1.5)" />
          <rect x="-0.08" y="-1.55" width="0.2" height="0.24" fill="#c9c1ad" />
          <rect x="0.18" y="-1.45" width="0.18" height="0.14" fill={PAPER} transform="rotate(6 0.27 -1.38)" />
          <path d="M-0.3 -1.4 L0 -1.45 L0.25 -1.35" stroke="#a3261e" strokeWidth="0.012" fill="none" />
        </g>
      );
    case "radio":
      return (
        <g>
          <Shadow w={0.5} />
          <path d="M-0.15 0 L-0.12 -0.6 M0.15 0 L0.12 -0.6" stroke={WOOD_D} strokeWidth="0.04" />
          <rect x="-0.18" y="-0.64" width="0.36" height="0.05" fill={WOOD} />
          <rect x="-0.22" y="-0.92" width="0.44" height="0.3" rx="0.04" fill="#6a4a2e" />
          <rect x="-0.18" y="-0.88" width="0.2" height="0.2" rx="0.02" fill="#3a2a1b" />
          <circle cx="0.1" cy="-0.8" r="0.04" fill="#c9b37a" />
          <path d="M0.05 -0.92 L0.2 -1.15" stroke="#888" strokeWidth="0.01" />
        </g>
      );
    case "toolbox":
      return (
        <g>
          <Shadow w={0.6} />
          <rect x="-0.28" y="-0.22" width="0.56" height="0.22" fill="#7a2a22" />
          <rect x="-0.28" y="-0.22" width="0.56" height="0.04" fill="#5a1d17" />
          {state === "closed" ? (
            <path d="M-0.1 -0.22 L-0.1 -0.3 L0.1 -0.3 L0.1 -0.22" stroke="#2a2a2a" strokeWidth="0.03" fill="none" />
          ) : (
            <g>
              <path d="M-0.28 -0.22 L-0.24 -0.44 L0.32 -0.44 L0.28 -0.22 Z" fill="#8a3229" />
              <rect x="-0.2" y="-0.27" width="0.3" height="0.04" fill={METAL} transform="rotate(-10)" />
            </g>
          )}
        </g>
      );
    case "drawer":
      return (
        <g>
          <Shadow w={0.9} />
          <rect x="-0.42" y="-1.05" width="0.84" height="1.05" fill={WOOD} />
          {[0.2, 0.52, 0.84].map((y, i) => (
            <g key={i}>
              <rect x="-0.37" y={-y - 0.27} width="0.74" height="0.26" fill={WOOD_D} transform={state !== "closed" && state !== "locked" && i === 1 ? "translate(0 0.06) scale(1.06 1)" : ""} />
              <circle cx="0" cy={-y - 0.14} r="0.025" fill="#b59a5a" />
            </g>
          ))}
        </g>
      );
    case "door":
    case "secret-door":
      return <Door state={state} />;
    default:
      if (model.startsWith("threat")) return <Threat element={info.element} known={info.known} state={state} />;
      return (
        <g>
          <Shadow w={0.6} />
          <rect x="-0.25" y="-0.4" width="0.5" height="0.4" fill={WOOD} />
          <path d="M-0.25 -0.4 L0.25 0 M0.25 -0.4 L-0.25 0" stroke={WOOD_D} strokeWidth="0.03" />
        </g>
      );
  }
}

/** Generic furniture for the room's obstacle tiles. */
export function Furniture({ kind }: { kind: string }) {
  switch (kind) {
    case "desk":
      return (
        <g>
          <Shadow w={0.8} o={0.35} />
          <rect x="-0.32" y="-0.72" width="0.64" height="0.05" fill="#8a7a5a" />
          <path d="M-0.28 0 L-0.28 -0.7 M0.28 0 L0.28 -0.7" stroke={METAL_D} strokeWidth="0.035" />
          <rect x="-0.2" y="-0.46" width="0.4" height="0.04" fill="#6e5f45" />
          <path d="M-0.18 0 L-0.18 -0.44 M0.18 0 L0.18 -0.44 M0.18 -0.44 L0.2 -0.75" stroke={METAL_D} strokeWidth="0.03" />
        </g>
      );
    case "cabinet":
      return (
        <g>
          <Shadow w={0.7} />
          <rect x="-0.3" y="-1.35" width="0.6" height="1.35" fill={METAL} />
          {[0.3, 0.75, 1.15].map((y) => (
            <g key={y}>
              <rect x="-0.26" y={-y - 0.36} width="0.52" height="0.38" fill={METAL_D} />
              <rect x="-0.06" y={-y - 0.2} width="0.12" height="0.03" fill="#9aa0a6" />
            </g>
          ))}
        </g>
      );
    case "shelf":
      return (
        <g>
          <Shadow w={1} />
          <path d="M-0.5 0 L-0.5 -1.9 M0.5 0 L0.5 -1.9" stroke={METAL_D} strokeWidth="0.04" />
          {[0.3, 0.8, 1.3, 1.8].map((y, i) => (
            <g key={y}>
              <rect x="-0.5" y={-y} width="1" height="0.03" fill={METAL} />
              {[0, 1, 2].map((j) => (
                <rect key={j} x={-0.45 + j * 0.31} y={-y - 0.24 + ((i + j) % 2) * 0.04} width="0.26" height={0.24 - ((i + j) % 2) * 0.04} fill={(i + j) % 3 ? "#8a7254" : "#a08a64"} />
              ))}
            </g>
          ))}
        </g>
      );
    case "books":
      return (
        <g>
          <Shadow w={1} />
          <rect x="-0.5" y="-2" width="1" height="2" fill={WOOD_D} />
          {[0.35, 0.85, 1.35, 1.85].map((y, i) => (
            <g key={y}>
              <rect x="-0.46" y={-y} width="0.92" height="0.03" fill={WOOD} />
              {Array.from({ length: 9 }, (_, j) => (
                <rect key={j} x={-0.44 + j * 0.1} y={-y - 0.36 + ((i * 3 + j) % 4) * 0.03} width="0.08" height={0.36 - ((i * 3 + j) % 4) * 0.03} fill={["#5a2a22", "#2f3d4a", "#4a4a2a", "#6b5a3a"][(i + j) % 4]} />
              ))}
            </g>
          ))}
        </g>
      );
    case "bench":
      return (
        <g>
          <Shadow w={1.1} />
          <rect x="-0.55" y="-0.48" width="1.1" height="0.07" fill={WOOD} />
          <rect x="-0.55" y="-0.95" width="1.1" height="0.07" fill={WOOD} />
          <path d="M-0.5 0 L-0.5 -0.95 M0.5 0 L0.5 -0.95" stroke={WOOD_D} strokeWidth="0.06" />
        </g>
      );
    case "sofa":
      return (
        <g>
          <Shadow w={1.3} />
          <path d="M-0.65 0 L-0.65 -0.75 C-0.65 -0.85 0.65 -0.85 0.65 -0.75 L0.65 0 Z" fill="#cfc8b8" />
          <path d="M-0.55 -0.35 C-0.2 -0.45 0.2 -0.3 0.55 -0.4" stroke="#a69e8c" strokeWidth="0.02" fill="none" />
        </g>
      );
    case "stove":
      return (
        <g>
          <Shadow w={1} />
          <rect x="-0.5" y="-0.8" width="1" height="0.8" fill="#6a5d50" />
          <rect x="-0.5" y="-0.86" width="1" height="0.08" fill="#2a2420" />
          <rect x="-0.35" y="-0.55" width="0.3" height="0.25" fill="#1a1512" />
          <rect x="0.2" y="-1.9" width="0.14" height="1.05" fill="#3a332c" />
        </g>
      );
    case "crate":
      return (
        <g>
          <Shadow w={0.8} />
          <rect x="-0.35" y="-0.6" width="0.7" height="0.6" fill="#7a5f3e" />
          <rect x="-0.3" y="-1.0" width="0.5" height="0.4" fill="#8a6d48" />
          <path d="M-0.35 -0.3 L0.35 -0.3" stroke="#5a4530" strokeWidth="0.03" />
        </g>
      );
    case "car":
      return (
        <g>
          <ellipse rx="1.2" ry="0.2" fill="#000" opacity="0.5" />
          <path d="M-1.1 -0.2 L-1.1 -0.6 L-0.6 -0.65 L-0.35 -1.0 L0.45 -1.0 L0.7 -0.65 L1.1 -0.6 L1.1 -0.2 Z" fill="#2e3440" />
          <path d="M-0.3 -0.95 L-0.5 -0.67 L0.05 -0.67 L0.05 -0.95 Z M0.12 -0.95 L0.12 -0.67 L0.6 -0.67 L0.42 -0.95 Z" fill="#5d6b7c" opacity="0.6" />
          <circle cx="-0.62" cy="-0.2" r="0.2" fill="#111" />
          <circle cx="0.62" cy="-0.2" r="0.2" fill="#111" />
        </g>
      );
    case "fence":
      return (
        <g>
          <path d="M-0.9 0 L-0.9 -0.9 M-0.3 0 L-0.3 -0.85 M0.3 0 L0.3 -0.95 M0.9 0 L0.9 -0.8 M-0.95 -0.7 L0.95 -0.62 M-0.95 -0.3 L0.95 -0.36" stroke="#5a4632" strokeWidth="0.06" />
        </g>
      );
    case "tree":
      return (
        <g>
          <ellipse rx="1" ry="0.2" fill="#000" opacity="0.45" />
          <path d="M-0.1 0 L-0.08 -2.2 L0.08 -2.2 L0.12 0 Z" fill="#2a1f17" />
          <path d="M0 -1.6 L-0.6 -2.3 M0 -1.9 L0.5 -2.6" stroke="#2a1f17" strokeWidth="0.07" />
          <ellipse cx="-0.4" cy="-2.7" rx="0.9" ry="0.6" fill="#16221a" />
          <ellipse cx="0.45" cy="-2.9" rx="0.8" ry="0.55" fill="#1b2a20" />
          <ellipse cx="0" cy="-3.3" rx="0.75" ry="0.5" fill="#1f3024" />
        </g>
      );
    default:
      return <Furniture kind="crate" />;
  }
}

export const FURNITURE_HEIGHT: Record<string, number> = { desk: 0.8, cabinet: 1.4, shelf: 1.9, books: 2, bench: 1, sofa: 0.8, stove: 1.9, crate: 1, car: 1, fence: 1, tree: 3.6 };
