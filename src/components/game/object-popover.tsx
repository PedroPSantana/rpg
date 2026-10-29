"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import type { MapObject } from "@/modules/world/schema";
import { Portrait } from "../scene/portrait";
import { STATE_LABELS, type View } from "./types";

/**
 * What the agent can do with a clicked object. Plain actions (look, open,
 * take…) go straight to the rules engine, which decides whether a roll is
 * needed; anything else is written in the agent's own words.
 */
export function ObjectPopover({ obj, view, disabled, onClose, onAction, onText }: { obj: MapObject; view: View; disabled: boolean; onClose: () => void; onAction: (a: Record<string, unknown>) => void; onText: (text: string) => void }) {
  const [text, setText] = useState("");
  const state = view.state.maps[view.state.currentMapId].objects[obj.id]?.state ?? obj.initialState;
  const clue = view.blueprint.clues.find((c) => c.objectId === obj.id && c.title !== "???");
  const npc = obj.kind === "npc" ? view.blueprint.npcs.find((n) => n.objectId === obj.id) : undefined;
  const inCombat = view.state.mode === "combat";
  const verbs: [string, string][] = [];
  const has = (v: string) => obj.verbs.includes(v as MapObject["verbs"][number]);
  if (!npc) {
    if (has("search") && state !== "searched") verbs.push(["search", obj.kind === "container" ? "Revistar" : "Examinar de perto"]);
    else if (has("inspect")) verbs.push(["inspect", "Examinar"]);
    if (has("open") && state === "closed") verbs.push(["open", "Abrir"]);
    if (has("close") && state === "open") verbs.push(["close", "Fechar"]);
    if (has("take") && state !== "taken") verbs.push(["take", "Pegar"]);
    if (has("use")) verbs.push(["use", "Usar"]);
    if (has("enter") && state !== "locked") verbs.push(["enter", obj.kind === "exit" ? "Atravessar" : "Entrar"]);
  }
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onText(t);
    setText("");
  };
  return (
    <div className="absolute bottom-4 left-4 z-10 w-[min(380px,calc(100%-2rem))] rounded-xl border border-line bg-ink/92 p-4 shadow-2xl backdrop-blur" role="dialog" aria-label={obj.name}>
      <div className="mb-2 flex items-start gap-3">
        {npc && <Portrait name={npc.name} role={npc.role} calm={obj.model === "npc-calm"} size={44} />}
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg leading-tight">{npc?.name ?? obj.name}</h3>
          {npc && <p className="text-xs text-ash">{npc.role}</p>}
          {!npc && STATE_LABELS[state] && <p className="text-[11px] uppercase tracking-wider text-dim">{STATE_LABELS[state]}</p>}
        </div>
        <button type="button" onClick={onClose} className="text-dim hover:text-bone" aria-label="Fechar">
          ✕
        </button>
      </div>
      {!npc && <p className="mb-3 text-sm text-ash">{clue ? clue.description : obj.description}</p>}
      {inCombat ? (
        <p className="text-xs text-gold">Em combate: descreva sua ação ou use a aba Combate.</p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap gap-1.5">
            <Button variant="quiet" disabled={disabled} className="px-2.5 py-1 text-xs" onClick={() => onAction({ type: "observe", objectId: obj.id })}>
              Olhar
            </Button>
            {verbs.map(([v, label]) => (
              <Button key={v} variant="ghost" disabled={disabled} className="px-2.5 py-1 text-xs" onClick={() => onAction({ type: "interact", objectId: obj.id, verb: v, powers: [] })}>
                {label}
              </Button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex gap-2"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1000}
              autoFocus={!!npc}
              placeholder={npc ? `O que você diz a ${npc.name.split(" ")[0]}?` : "Ou descreva o que você faz…"}
              className="min-w-0 flex-1 rounded-md border border-line bg-night px-2.5 py-1.5 text-sm outline-none focus:border-gold"
            />
            <Button type="submit" variant="primary" className="px-3 py-1.5 text-xs" disabled={disabled || !text.trim()}>
              {npc ? "Falar" : "Agir"}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
