"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, ButtonLink, Meter } from "@/components/ui";
import type { MapObject, Position } from "@/modules/world/schema";
import { ActionMenu } from "./action-menu";
import { CombatPanel, DicePanel, InventoryPanel, JournalPanel, SheetPanel } from "./panels";
import type { View } from "./types";

const GameScene = dynamic(() => import("./scene").then((m) => m.GameScene), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-dim">Carregando cena…</div>,
});

type Tab = "diario" | "ficha" | "inventario" | "dados" | "combate";

function newKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function Game({ initial, gmLabel }: { initial: View; gmLabel: string }) {
  const [view, setView] = useState(initial);
  const [selected, setSelected] = useState<MapObject | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("diario");
  const [effects, setEffects] = useState<{ list: string[]; nonce: number }>({ list: [], nonce: 0 });
  const feedRef = useRef<HTMLDivElement>(null);
  const id = view.campaign.id;

  const map = view.blueprint.maps.find((m) => m.id === view.state.currentMapId)!;
  const mapState = view.state.maps[map.id];
  const character = view.character!;
  const ended = view.state.mode === "ended";
  const inCombat = view.state.mode === "combat";

  const reload = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${id}`, { cache: "no-store" });
    if (res.ok) setView(await res.json());
  }, [id]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [view.narrative.length]);

  // Jump to the combat tab when a fight starts (state adjusted during render, not in an effect).
  const [wasInCombat, setWasInCombat] = useState(inCombat);
  if (inCombat !== wasInCombat) {
    setWasInCombat(inCombat);
    if (inCombat) setTab("combate");
  }

  const lastGm = useMemo(() => [...view.narrative].reverse().find((n) => n.role === "GM"), [view.narrative]);
  const suggestions = ((lastGm?.meta as { suggestions?: string[] } | null)?.suggestions ?? []).slice(0, 4);
  const pendingNarration = view.actions.find((a) => a.status === "RESOLVED" && !a.narration && a.sequence > 0);

  async function send(payload: { action: Record<string, unknown> } | { text: string }) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const key = newKey();
    const body = JSON.stringify({ idempotencyKey: key, expectedVersion: view.campaign.version, ...payload });
    let res: Response | null = null;
    // Network retries reuse the same idempotency key, so an action is never applied twice.
    for (let attempt = 0; attempt < 3 && !res; attempt++) {
      try {
        res = await fetch(`/api/campaigns/${id}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body });
      } catch {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }
    if (!res) {
      setBusy(false);
      setError("Sem conexão com o servidor. Sua ação não foi perdida: tente de novo.");
      return;
    }
    const result = await res.json().catch(() => null);
    if (!res.ok) setError(result?.error ?? "Algo deu errado.");
    else if (result.status === "rejected") setError(result.message);
    await reload();
    setBusy(false);
  }

  // Trigger cosmetic effects when a new GM entry arrives.
  const [seenGmId, setSeenGmId] = useState(lastGm?.id);
  if (lastGm && lastGm.id !== seenGmId) {
    setSeenGmId(lastGm.id);
    const list = ((lastGm.meta as { effects?: string[] } | null)?.effects ?? []).filter((e) => e !== "none");
    if (list.length) setEffects((e) => ({ list, nonce: e.nonce + 1 }));
  }

  async function retryNarration(actionId: string) {
    setBusy(true);
    await fetch(`/api/campaigns/${id}/actions/${actionId}/narrate`, { method: "POST" });
    await reload();
    setBusy(false);
  }

  const onTile = (p: Position) => {
    setSelected(null);
    if (ended || inCombat) return;
    if (p.x === mapState.player.x && p.y === mapState.player.y) return;
    send({ action: { type: "move", to: p } });
  };

  const urgencyPct = (view.state.urgency / view.blueprint.urgency.max) * 100;
  const effectClass = effects.list.includes("heartbeat") || effects.list.includes("cold_breath") ? "fx-heartbeat" : effects.list.includes("lights_flicker") ? "fx-flicker" : "";

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col lg:flex-row">
      {/* Scene + narration */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-[300px] flex-1 overflow-hidden bg-ink">
          <GameScene map={map} state={mapState} selectedId={selected?.id ?? null} effects={effects.list} effectNonce={effects.nonce} onTile={onTile} onObject={(o) => setSelected(o)} />
          {effectClass && <div key={effects.nonce} aria-hidden className={`pointer-events-none absolute inset-0 ${effectClass}`} />}
          {effects.list.some((e) => e === "whisper" || e === "static_noise") && (
            <p key={`c${effects.nonce}`} className="fx-caption pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-sm italic text-ash/80">
              {effects.list.includes("whisper") ? "(sussurros que você não entende)" : "(chiado de estática)"}
            </p>
          )}

          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-3 bg-gradient-to-b from-ink/90 to-transparent p-4">
            <div className="pointer-events-auto">
              <Link href="/" className="text-xs text-dim hover:text-ash">
                ← Campanhas
              </Link>
              <h1 className="font-display text-xl leading-tight">{view.campaign.name}</h1>
              <p className="text-xs text-ash">
                {map.name} · Cena {view.state.scene}
              </p>
            </div>
            <div className="pointer-events-auto w-56 space-y-1.5 rounded-lg border border-line/80 bg-ink/70 p-3 backdrop-blur">
              <Meter label="PV" value={character.state.pv} max={character.sheet.pvMax} color="#b3261e" />
              <Meter label="SAN" value={character.state.san} max={character.sheet.sanMax} color="#7b8fe0" />
              <Meter label="PE" value={character.state.pe} max={character.sheet.peMax} color="#d6a55a" />
              <div title="Relógio de urgência (procedimento original deste projeto)">
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-semibold tracking-wide text-ash">Urgência</span>
                  <span className="font-mono">
                    {view.state.urgency}/{view.blueprint.urgency.max}
                  </span>
                </div>
                <div className="flex gap-0.5">
                  {Array.from({ length: view.blueprint.urgency.max }, (_, i) => (
                    <div key={i} className={`h-1.5 flex-1 rounded-sm ${i < view.state.urgency ? (urgencyPct > 66 ? "bg-blood" : "bg-ember") : "bg-raised"}`} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {inCombat && (
            <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2">
              <Badge tone="red" className="text-xs">
                Combate · rodada {view.state.encounter?.round}
              </Badge>
            </div>
          )}

          {selected && !ended && (
            <ActionMenu
              obj={selected}
              view={view}
              disabled={busy}
              onClose={() => setSelected(null)}
              onAction={(action) => {
                send({ action });
                setSelected(null);
              }}
            />
          )}

          {view.decisionAvailable && !ended && <DecisionBanner view={view} disabled={busy} onDecide={(optionId) => send({ action: { type: "decide", optionId } })} />}

          {ended && view.state.ending && <EndingOverlay view={view} />}
        </div>

        {/* Narration feed */}
        <div className="flex h-[38%] min-h-[220px] flex-col border-t border-line bg-night">
          <div ref={feedRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {view.narrative.slice(-60).map((n) => (
              <div key={n.id} className={n.role === "PLAYER" ? "text-right" : ""}>
                {n.role === "GM" && <p className="font-display whitespace-pre-line text-[15px] leading-relaxed text-bone">{n.content}</p>}
                {n.role === "PLAYER" && <p className="inline-block max-w-[85%] rounded-lg bg-raised px-3 py-1.5 text-sm italic text-ash">{n.content}</p>}
                {n.role === "SYSTEM" && <p className="text-xs text-gold/90">{n.content}</p>}
              </div>
            ))}
            {pendingNarration && (
              <div className="flex items-center gap-2 text-xs text-dim">
                A narração desta ação não chegou (a mecânica já foi aplicada).
                <Button variant="quiet" className="px-2 py-1 text-xs" disabled={busy} onClick={() => retryNarration(pendingNarration.id)}>
                  Tentar narrar de novo
                </Button>
              </div>
            )}
            {busy && <p className="animate-pulse text-xs text-dim">O mestre pondera…</p>}
          </div>
          {error && <p className="border-t border-blood/30 bg-blood/10 px-4 py-1.5 text-xs text-[#ff9a8f]">{error}</p>}
          {!ended && suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 pt-2">
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => setText(s)} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ash hover:border-ash/60 hover:text-bone">
                  {s}
                </button>
              ))}
            </div>
          )}
          <form
            className="flex gap-2 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              send({ text });
              setText("");
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={ended}
              maxLength={2000}
              placeholder={ended ? "A investigação terminou." : "Descreva o que seu agente faz ou diz… (ou pergunte uma regra)"}
              className="flex-1 rounded-md border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-gold"
            />
            <Button type="submit" variant="primary" disabled={busy || ended || !text.trim()}>
              Agir
            </Button>
          </form>
          <p className="px-4 pb-2 text-[10px] text-dim">
            Mestre: {gmLabel} · Dados rolados no servidor · Clique no chão para andar e nos objetos para interagir.
          </p>
        </div>
      </div>

      {/* Side panel */}
      <aside className="flex max-h-[50vh] w-full flex-col border-l border-line bg-panel lg:max-h-none lg:w-[380px]">
        <nav className="flex border-b border-line text-xs">
          {(
            [
              ["diario", "Diário"],
              ["ficha", "Ficha"],
              ["inventario", "Inventário"],
              ["dados", "Dados"],
              ["combate", "Combate"],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`flex-1 px-2 py-2.5 transition ${tab === t ? "border-b-2 border-blood text-bone" : "text-dim hover:text-ash"}`}>
              {label}
              {t === "combate" && inCombat && <span className="ml-1 text-blood">●</span>}
            </button>
          ))}
        </nav>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
          {tab === "diario" && <JournalPanel view={view} />}
          {tab === "ficha" && <SheetPanel view={view} />}
          {tab === "inventario" && <InventoryPanel view={view} />}
          {tab === "dados" && <DicePanel view={view} />}
          {tab === "combate" && <CombatPanel view={view} disabled={busy} onAction={(action) => send({ action })} />}
        </div>
        <div className="flex gap-2 border-t border-line p-3 text-xs">
          <ButtonLink href={`/campanhas/${id}/historico`} variant="quiet" className="px-2 py-1 text-xs">
            Histórico
          </ButtonLink>
          <ButtonLink href={`/campanhas/${id}/personagem`} variant="quiet" className="px-2 py-1 text-xs">
            Agente
          </ButtonLink>
          {!ended && (
            <Button
              variant="quiet"
              className="ml-auto px-2 py-1 text-xs"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Abandonar a missão? Isso encerra a investigação com um desfecho de fuga.")) send({ action: { type: "abandon" } });
              }}
            >
              Abandonar missão
            </Button>
          )}
        </div>
      </aside>
    </div>
  );
}

function DecisionBanner({ view, disabled, onDecide }: { view: View; disabled: boolean; onDecide: (optionId: string) => void }) {
  const d = view.blueprint.decision;
  return (
    <div className="absolute inset-x-4 bottom-4 mx-auto max-w-2xl rounded-xl border border-gold/40 bg-ink/90 p-4 backdrop-blur">
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gold">Decisão</p>
      <p className="font-display mb-3 text-lg">{d.prompt}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {d.options.map((o) => {
          const lacks = !!o.requiresFlag && !view.state.flags[o.requiresFlag];
          return (
            <button
              key={o.id}
              type="button"
              disabled={disabled || lacks}
              onClick={() => onDecide(o.id)}
              className="rounded-lg border border-line p-3 text-left text-sm transition hover:border-gold/60 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="block font-medium">{o.label}</span>
              <span className="block text-xs text-ash">{o.description}</span>
              {o.check && <span className="mt-1 block font-mono text-[10px] text-dim">Teste: DT {o.check.dt}</span>}
              {lacks && <span className="mt-1 block text-[10px] text-dim">Você ainda não sabe o suficiente.</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EndingOverlay({ view }: { view: View }) {
  const e = view.state.ending!;
  const tone = e.tone === "vitoria" ? "text-ok" : e.tone === "derrota" ? "text-blood" : "text-gold";
  return (
    <div className="absolute inset-0 grid place-items-center bg-ink/85 p-6 backdrop-blur-sm">
      <div className="max-w-lg text-center">
        <p className={`mb-2 text-xs font-semibold uppercase tracking-[0.3em] ${tone}`}>Fim da investigação</p>
        <h2 className="font-display mb-4 text-4xl">{e.title}</h2>
        <p className="mb-4 text-ash">{e.summary}</p>
        {view.blueprint.antagonist.name !== "???" && (
          <p className="mb-4 text-sm text-dim">
            Por trás de tudo: <span className="text-bone">{view.blueprint.antagonist.name}</span> — {view.blueprint.antagonist.motive}
          </p>
        )}
        <p className="mb-6 font-mono text-xs text-dim">
          Prestígio +{e.rewards.prestige} · NEX +{e.rewards.nexGain}% {e.rewards.note && `· ${e.rewards.note}`}
        </p>
        <div className="flex justify-center gap-2">
          <ButtonLink href={`/campanhas/${view.campaign.id}/historico`}>Ver histórico</ButtonLink>
          <ButtonLink href="/campanhas/nova" variant="primary">
            Nova campanha
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
