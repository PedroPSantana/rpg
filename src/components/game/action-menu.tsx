"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { SKILL_POWERS } from "@/modules/rules/systems/ordem-paranormal/tests";
import type { MapObject } from "@/modules/world/schema";
import { APPROACHES, POWER_LABELS, STATE_LABELS, VERB_LABELS, type View } from "./types";

export function ActionMenu({ obj, view, disabled, onClose, onAction }: { obj: MapObject; view: View; disabled: boolean; onClose: () => void; onAction: (a: Record<string, unknown>) => void }) {
  const [powers, setPowers] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const state = view.state.maps[view.state.currentMapId].objects[obj.id]?.state ?? obj.initialState;
  const clue = view.blueprint.clues.find((c) => c.objectId === obj.id && c.title !== "???");
  const npc = obj.kind === "npc" ? view.blueprint.npcs.find((n) => n.objectId === obj.id) : undefined;
  const available = SKILL_POWERS.filter((p) => view.character!.sheet.abilities.some((a) => a.id === p));
  const inCombat = view.state.mode === "combat";
  const verbs = obj.verbs.filter((v) => v !== "talk");
  const toggle = (p: string) => setPowers((xs) => (xs.includes(p) ? xs.filter((x) => x !== p) : [...xs, p]));

  return (
    <div className="absolute bottom-4 left-4 z-10 w-[min(360px,calc(100%-2rem))] rounded-xl border border-line bg-ink/92 p-4 shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg leading-tight">{obj.name}</h3>
          {STATE_LABELS[state] && <p className="text-[11px] uppercase tracking-wider text-dim">{STATE_LABELS[state]}</p>}
        </div>
        <button type="button" onClick={onClose} className="text-dim hover:text-bone" aria-label="Fechar">
          ✕
        </button>
      </div>
      <p className="mb-3 text-sm text-ash">{clue ? clue.description : obj.description}</p>

      {inCombat && <p className="mb-2 text-xs text-gold">Em combate, use o painel de combate.</p>}

      {!inCombat && npc && (
        <div className="space-y-2">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            placeholder={`O que você diz a ${npc.name}? (opcional)`}
            className="w-full rounded-md border border-line bg-night px-2.5 py-1.5 text-sm outline-none focus:border-gold"
          />
          <div className="flex flex-wrap gap-1.5">
            {APPROACHES.map((a) => (
              <Button key={a.id} disabled={disabled} className="px-2.5 py-1 text-xs" onClick={() => onAction({ type: "talk", npcId: npc.id, approach: a.id, message: message || undefined, powers })}>
                {a.label}
              </Button>
            ))}
            <Button variant="quiet" disabled={disabled} className="px-2.5 py-1 text-xs" onClick={() => onAction({ type: "interact", objectId: obj.id, verb: "inspect", powers })}>
              Examinar
            </Button>
          </div>
        </div>
      )}

      {!inCombat && !npc && (
        <div className="flex flex-wrap gap-1.5">
          {verbs.map((v) => (
            <Button key={v} disabled={disabled} variant={v === "search" || v === "enter" ? "primary" : "ghost"} className="px-2.5 py-1 text-xs" onClick={() => onAction({ type: "interact", objectId: obj.id, verb: v, powers })}>
              {VERB_LABELS[v] ?? v}
            </Button>
          ))}
        </div>
      )}

      {!inCombat && available.length > 0 && (
        <div className="mt-3 border-t border-line pt-2">
          <p className="mb-1 text-[11px] text-dim">Poderes neste teste (o motor só aplica se forem válidos):</p>
          <div className="flex flex-wrap gap-1">
            {available.map((p) => (
              <label key={p} className="flex items-center gap-1 text-xs text-ash">
                <input type="checkbox" className="accent-[#b3261e]" checked={powers.includes(p)} onChange={() => toggle(p)} />
                {POWER_LABELS[p] ?? p}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
