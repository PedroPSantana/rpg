"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button } from "@/components/ui";
import type { RollRequest } from "@/modules/campaign/dice";
import type { RollRecord } from "@/modules/rules/core/dice";

export interface PendingView {
  actionId: string;
  request: RollRequest;
  cancellable: boolean;
}

const OUTCOME = {
  success: { label: "Sucesso", tone: "green" },
  critical: { label: "Crítico", tone: "gold" },
  failure: { label: "Falha", tone: "red" },
  none: { label: "", tone: "neutral" },
} as const;

/** One die. While tumbling it shows random faces; it settles only on the face the server rolled. */
function Die({ sides, value, kept, rolling, delay }: { sides: number; value: number; kept: boolean; rolling: boolean; delay: number }) {
  const crit = !rolling && kept && sides === 20 && value === 20;
  const fumble = !rolling && kept && sides === 20 && value === 1;
  const fill = crit ? "#d6a55a" : fumble ? "#b3261e" : kept || rolling ? "#2b2531" : "#141117";
  const text = crit ? "#0b0a0d" : kept || rolling ? "#ece6da" : "#6f6a72";
  return (
    <svg viewBox="0 0 60 60" className={`size-12 shrink-0 ${rolling ? "dice-tumble" : "dice-settle"}`} style={{ animationDelay: `${delay}ms` }} aria-hidden>
      {sides === 20 ? (
        <g>
          <polygon points="30,3 54,16 54,44 30,57 6,44 6,16" fill={fill} stroke="#5a4f60" strokeWidth="2" />
          <polygon points="30,14 45,40 15,40" fill="none" stroke="#5a4f60" strokeWidth="1.2" opacity="0.7" />
        </g>
      ) : (
        <rect x="6" y="6" width="48" height="48" rx="9" fill={fill} stroke="#5a4f60" strokeWidth="2" />
      )}
      <text x="30" y={sides === 20 ? 36 : 37} textAnchor="middle" fontSize="20" fontWeight="700" fill={text} fontFamily="var(--font-mono)" textDecoration={!rolling && !kept ? "line-through" : undefined}>
        {value}
      </text>
    </svg>
  );
}

export function DiceTray({ pending, disabled, onRoll, onCancel }: { pending: PendingView | null; disabled: boolean; onRoll: (p: PendingView) => Promise<RollRecord | null>; onCancel: (p: PendingView) => void }) {
  const [shown, setShown] = useState<{ request: RollRequest; record: RollRecord | null; faces: number[]; rolling: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lock = useRef(false);

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  async function roll() {
    if (!pending || lock.current) return;
    lock.current = true;
    const { request } = pending;
    const count = request.dice.count;
    const random = () => Array.from({ length: count }, () => 1 + Math.floor(Math.random() * request.dice.sides));
    setShown({ request, record: null, faces: random(), rolling: true });
    timer.current = setInterval(() => setShown((s) => (s && s.rolling ? { ...s, faces: random() } : s)), 80);
    const started = Date.now();
    const record = await onRoll(pending);
    // Let the dice tumble a little, then land on exactly what the server rolled.
    await new Promise((r) => setTimeout(r, Math.max(0, 850 - (Date.now() - started))));
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setShown(record ? { request, record, faces: record.dice.map((d) => d.value), rolling: false } : null);
    lock.current = false;
  }

  if (!pending && !shown) return null;
  const rec = shown?.record;
  const o = rec ? OUTCOME[rec.outcome] ?? OUTCOME.none : null;
  const modSum = rec ? rec.modifiers.reduce((s, m) => s + m.value, 0) : 0;

  return (
    <div className="border-t border-gold/30 bg-gradient-to-b from-[#1d1720] to-night px-4 py-3">
      {shown && (
        <div className="mb-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-gold">{shown.request.label}</p>
            {o?.label && <Badge tone={o.tone}>{o.label}</Badge>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {shown.faces.map((f, i) => (
              <Die key={i} sides={rec?.dice[i]?.sides ?? shown.request.dice.sides} value={f} kept={rec ? rec.dice[i]?.kept ?? true : true} rolling={shown.rolling} delay={i * 60} />
            ))}
            {rec && (
              <div className="ml-1 flex items-baseline gap-2">
                {modSum !== 0 && <span className="font-mono text-sm text-ash">{modSum > 0 ? `+${modSum}` : modSum}</span>}
                <span className="font-mono text-sm text-dim">=</span>
                <span className="font-display text-3xl text-bone">{rec.total}</span>
                {rec.target !== undefined && (
                  <span className="text-sm text-ash">
                    vs {shown.request.targetLabel ?? "DT"} {rec.target}
                  </span>
                )}
              </div>
            )}
          </div>
          {rec && (
            <p className="mt-1 font-mono text-[11px] text-dim">
              {rec.expression}
              {rec.modifiers.map((m) => ` · ${m.source} ${m.value >= 0 ? "+" : ""}${m.value}`).join("")}
              {rec.notes.length ? ` · ${rec.notes.join(" ")}` : ""}
            </p>
          )}
          {rec && !pending && (
            <button type="button" className="mt-1 text-[11px] text-dim hover:text-ash" onClick={() => setShown(null)}>
              Fechar
            </button>
          )}
        </div>
      )}
      {pending && !shown?.rolling && (
        <div className={shown ? "border-t border-line pt-3" : ""}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-gold">Rolagem: {pending.request.label}</p>
              <p className="mt-1 text-sm text-bone">{pending.request.stakes}</p>
              <p className="mt-1 font-mono text-[11px] text-ash">
                {pending.request.expression}
                {pending.request.modifiers.map((m) => ` · ${m.source} ${m.value >= 0 ? "+" : ""}${m.value}`).join("")}
                {pending.request.extraDice.map((d) => ` · ${d.source} +${d.expression}`).join("")}
                {pending.request.target !== null && ` · ${pending.request.targetLabel ?? "DT"} ${pending.request.target}`}
                {pending.request.peCost > 0 && ` · custa ${pending.request.peCost} PE`}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {pending.cancellable && (
                <Button variant="quiet" className="px-2.5 py-1.5 text-xs" disabled={disabled} onClick={() => onCancel(pending)}>
                  Desistir
                </Button>
              )}
              <Button variant="primary" className="px-4" disabled={disabled} onClick={roll} autoFocus>
                🎲 Rolar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
