"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, ButtonLink } from "@/components/ui";
import type { RollRecord } from "@/modules/rules/core/dice";
import { SKILL_POWERS } from "@/modules/rules/systems/ordem-paranormal/tests";
import { areaAt } from "@/modules/world/areas";
import type { MapObject } from "@/modules/world/schema";
import { Minimap } from "../scene/minimap";
import type { PlacedOpening } from "../scene/projection";
import { DiceTray, type PendingView } from "./dice-tray";
import { ObjectPopover } from "./object-popover";
import { CluesPanel, CombatPanel, DicePanel, InventoryPanel, JournalPanel, SheetPanel } from "./panels";
import { POWER_LABELS, type RollDetail, type View } from "./types";

// The scene is pure SVG, but it reads the pointer and animates; keep it client-only.
const Stage = dynamic(() => import("../scene/stage").then((m) => m.Stage), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-dim">Montando a cena…</div>,
});

type Tab = "diario" | "pistas" | "ficha" | "inventario" | "combate" | "dados";

function newKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

type Payload = { action: Record<string, unknown> } | { text: string; targetId?: string | null; powers?: string[] };

export function Game({ initial, gmLabel }: { initial: View; gmLabel: string }) {
  const [view, setView] = useState(initial);
  const [selected, setSelected] = useState<MapObject | null>(null);
  const [text, setText] = useState("");
  const [powers, setPowers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("diario");
  const [mapOpen, setMapOpen] = useState(false);
  const [effects, setEffects] = useState<{ list: string[]; nonce: number }>({ list: [], nonce: 0 });
  // A ref, not state: two clicks in the same frame both see `busy === false`.
  const inFlight = useRef(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const id = view.campaign.id;

  const map = view.blueprint.maps.find((m) => m.id === view.state.currentMapId)!;
  const mapState = view.state.maps[map.id];
  const character = view.character!;
  const ended = view.state.mode === "ended";
  const inCombat = view.state.mode === "combat";
  const pendingState = view.state.pending;
  const pending: PendingView | null = pendingState ? { actionId: pendingState.actionId, request: pendingState.request, cancellable: pendingState.cancellable } : null;
  const area = areaAt(map, mapState.player);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${id}`, { cache: "no-store" });
    if (res.ok) setView(await res.json());
  }, [id]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [view.narrative.length, busy]);

  // Jump to the combat tab when a fight starts (state adjusted during render, not in an effect).
  const [wasInCombat, setWasInCombat] = useState(inCombat);
  if (inCombat !== wasInCombat) {
    setWasInCombat(inCombat);
    if (inCombat) setTab("combate");
  }

  const lastGm = useMemo(() => [...view.narrative].reverse().find((n) => n.role === "GM"), [view.narrative]);
  const pendingNarration = view.actions.find((a) => a.status === "RESOLVED" && !a.narration && a.sequence > 0);
  const rollsByAction = useMemo(() => {
    const m = new Map<string, RollDetail[]>();
    for (const r of [...view.rolls].reverse()) if (r.actionId) m.set(r.actionId, [...(m.get(r.actionId) ?? []), r.detail as RollDetail]);
    return m;
  }, [view.rolls]);
  const lastGmOfAction = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of view.narrative) if (n.role === "GM" && n.actionId) m.set(n.actionId, n.id);
    return m;
  }, [view.narrative]);

  async function post(url: string, body: unknown) {
    let res: Response | null = null;
    const payload = JSON.stringify(body);
    // Network retries reuse the same body (and idempotency key), so an action is never applied twice.
    for (let attempt = 0; attempt < 3 && !res; attempt++) {
      try {
        res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: payload });
      } catch {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }
    if (!res) return { ok: false, data: { error: "Sem conexão com o servidor. Nada foi perdido: tente de novo." } };
    return { ok: res.ok, data: await res.json().catch(() => null) };
  }

  async function send(payload: Payload) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const { ok, data } = await post(`/api/campaigns/${id}/actions`, { idempotencyKey: newKey(), expectedVersion: view.campaign.version, ...payload });
    if (!ok) setError(data?.error ?? "Algo deu errado.");
    await reload();
    setBusy(false);
    inFlight.current = false;
  }

  async function roll(p: PendingView): Promise<RollRecord | null> {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const { ok, data } = await post(`/api/campaigns/${id}/actions/${p.actionId}/roll`, { index: p.request.index });
    inFlight.current = false;
    if (!ok) {
      setError(data?.error ?? "Não foi possível rolar.");
      await reload();
      setBusy(false);
      return null;
    }
    const rolled = (data?.rolled ?? []) as RollRecord[];
    // Show the dice first; the narration arrives with the reload.
    void reload().then(() => setBusy(false));
    return rolled.find((r) => r.label === p.request.label) ?? rolled[0] ?? null;
  }

  async function cancel(p: PendingView) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const { ok, data } = await post(`/api/campaigns/${id}/actions/${p.actionId}/cancel`, {});
    if (!ok) setError(data?.error ?? "Não foi possível desistir.");
    await reload();
    setBusy(false);
    inFlight.current = false;
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

  const locked = busy || ended || !!pending;
  const onOpening = (o: PlacedOpening) => {
    if (locked) return;
    const st = mapState.objects[o.object.id]?.state ?? o.object.initialState;
    setSelected(null);
    if (st === "locked") return setSelected(o.object);
    if (o.toAreaId) return send({ action: { type: "go", areaId: o.toAreaId } });
    if (o.object.kind === "exit") return send({ action: { type: "interact", objectId: o.object.id, verb: "enter", powers: [] } });
    setSelected(o.object);
  };

  const available = SKILL_POWERS.filter((p) => character.sheet.abilities.some((a) => a.id === p));
  const urgencyPct = (view.state.urgency / view.blueprint.urgency.max) * 100;
  const effectClass = effects.list.includes("heartbeat") || effects.list.includes("cold_breath") ? "fx-heartbeat" : "";
  const threats = Object.fromEntries(
    view.blueprint.encounters.map((e) => {
      const t = view.blueprint.threats.find((x) => x.id === e.threatId);
      return [e.objectId, { element: (t?.element ?? "morte").toLowerCase(), known: !!t && t.name !== "???" }];
    }),
  );
  const areaNames = Object.fromEntries(map.areas.map((a) => [a.id, a.name]));

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col lg:flex-row">
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Scene */}
        <div className="relative min-h-[200px] flex-[1.7] lg:min-h-[260px] overflow-hidden bg-black" onClick={() => setSelected(null)}>
          <Stage
            map={map}
            maps={view.blueprint.maps}
            state={mapState}
            placeName={view.blueprint.setting.place}
            people={view.blueprint.npcs}
            threats={threats}
            selectedId={selected?.id ?? null}
            areaNames={areaNames}
            effects={effects.list}
            effectNonce={effects.nonce}
            onObject={(o) => !ended && setSelected(o)}
            onOpening={onOpening}
          />
          {effectClass && <div key={effects.nonce} aria-hidden className={`pointer-events-none absolute inset-0 ${effectClass}`} />}
          {effects.list.some((e) => e === "whisper" || e === "static_noise") && (
            <p key={`c${effects.nonce}`} className="fx-caption pointer-events-none absolute bottom-12 left-1/2 -translate-x-1/2 text-sm italic text-ash/80">
              {effects.list.includes("whisper") ? "(sussurros que você não entende)" : "(chiado de estática)"}
            </p>
          )}

          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/80 to-transparent p-3 sm:p-4">
            <div className="pointer-events-auto min-w-0">
              <Link href="/" className="text-[11px] text-dim hover:text-ash">
                ← Campanhas
              </Link>
              <h1 className="font-display truncate text-lg leading-tight sm:text-xl">{area?.name ?? map.name}</h1>
              <p className="truncate text-xs text-ash">
                {map.kind === "interior" ? view.blueprint.setting.place : `${view.blueprint.setting.city} · ${view.blueprint.setting.time}`}
              </p>
            </div>
            <div className="pointer-events-auto flex shrink-0 items-center gap-3 rounded-lg border border-line/70 bg-ink/70 px-3 py-2 font-mono text-xs backdrop-blur" onClick={(e) => e.stopPropagation()}>
              <Stat label="PV" v={character.state.pv} max={character.sheet.pvMax} color="#e0574c" />
              <Stat label="SAN" v={character.state.san} max={character.sheet.sanMax} color="#8fa0ee" />
              <Stat label="PE" v={character.state.pe} max={character.sheet.peMax} color="#d6a55a" />
              <div title="Relógio de urgência (procedimento original deste projeto)" className="hidden sm:block">
                <div className="mb-0.5 text-[10px] text-dim">URG</div>
                <div className="flex gap-0.5">
                  {Array.from({ length: view.blueprint.urgency.max }, (_, i) => (
                    <div key={i} className={`h-2 w-1.5 rounded-sm ${i < view.state.urgency ? (urgencyPct > 66 ? "bg-blood" : "bg-ember") : "bg-raised"}`} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {inCombat && (
            <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2">
              <Badge tone="red" className="text-xs">
                Combate · rodada {view.state.encounter?.round}
              </Badge>
            </div>
          )}

          <div className="absolute bottom-3 right-3 w-44 sm:w-52" onClick={(e) => e.stopPropagation()}>
            {mapOpen ? (
              <div className="rounded-lg border border-line/80 bg-ink/85 p-2 backdrop-blur">
                <button type="button" onClick={() => setMapOpen(false)} className="mb-1 block w-full text-left text-[10px] uppercase tracking-widest text-dim hover:text-ash">
                  Planta · {map.name} ▾
                </button>
                <Minimap map={map} state={mapState} visited={view.state.areasVisited} onArea={(areaId) => !locked && areaId !== area?.id && send({ action: { type: "go", areaId } })} />
              </div>
            ) : (
              <button type="button" onClick={() => setMapOpen(true)} className="ml-auto block rounded-full border border-line/80 bg-ink/80 px-3 py-1 text-xs text-ash backdrop-blur hover:text-bone">
                Planta ▸
              </button>
            )}
          </div>

          {selected && !ended && (
            <div onClick={(e) => e.stopPropagation()}>
              <ObjectPopover
                obj={selected}
                view={view}
                disabled={locked}
                onClose={() => setSelected(null)}
                onAction={(action) => {
                  setSelected(null);
                  send({ action });
                }}
                onText={(t) => {
                  const targetId = selected.id;
                  setSelected(null);
                  send({ text: t, targetId, powers });
                  setPowers([]);
                }}
              />
            </div>
          )}

          {view.decisionAvailable && !ended && !selected && <DecisionBanner view={view} disabled={locked} onDecide={(optionId) => send({ action: { type: "decide", optionId } })} />}

          {ended && view.state.ending && <EndingOverlay view={view} />}
        </div>

        {/* Narration feed */}
        <div className="flex min-h-[170px] flex-1 flex-col border-t border-line bg-night lg:min-h-[220px]">
          <div ref={feedRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-4 py-3 sm:px-6" aria-live="polite">
            {view.narrative.slice(-80).map((n) => (
              <FeedEntry key={n.id} entry={n} rolls={n.actionId && lastGmOfAction.get(n.actionId) === n.id ? rollsByAction.get(n.actionId) : undefined} />
            ))}
            {pendingNarration && (
              <div className="flex items-center gap-2 text-xs text-dim">
                A narração desta ação não chegou (a mecânica já foi aplicada).
                <Button variant="quiet" className="px-2 py-1 text-xs" disabled={busy} onClick={() => retryNarration(pendingNarration.id)}>
                  Tentar narrar de novo
                </Button>
              </div>
            )}
            {busy && !pending && <p className="animate-pulse text-xs text-dim">A mestra pondera…</p>}
          </div>
          {error && <p className="border-t border-blood/30 bg-blood/10 px-4 py-1.5 text-xs text-[#ff9a8f]">{error}</p>}
          <DiceTray pending={pending} disabled={busy} onRoll={roll} onCancel={cancel} />
          {!pending && (
            <form
              className="flex flex-col gap-2 border-t border-line p-3"
              onSubmit={(e) => {
                e.preventDefault();
                const t = text.trim();
                if (!t || locked) return;
                send({ text: t, targetId: selected?.id ?? null, powers });
                setText("");
                setPowers([]);
              }}
            >
              <div className="flex gap-2">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  disabled={ended}
                  rows={1}
                  maxLength={2000}
                  placeholder={ended ? "A investigação terminou." : "O que você faz ou diz?"}
                  className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-md border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-gold"
                />
                <Button type="submit" variant="primary" disabled={locked || !text.trim()}>
                  Agir
                </Button>
              </div>
              {available.length > 0 && !ended && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-dim">
                  <span>Poderes no próximo teste:</span>
                  {available.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPowers((xs) => (xs.includes(p) ? xs.filter((x) => x !== p) : [...xs, p]))}
                      className={`rounded-full border px-2 py-0.5 transition ${powers.includes(p) ? "border-gold/70 bg-gold/10 text-gold" : "border-line text-ash hover:text-bone"}`}
                    >
                      {POWER_LABELS[p] ?? p}
                    </button>
                  ))}
                </div>
              )}
            </form>
          )}
          <p className="px-4 pb-2 text-[10px] text-dim">Mestra: {gmLabel} · os dados são rolados no servidor quando você clica.</p>
        </div>
      </div>

      {/* Side panel */}
      <aside className="flex max-h-[36vh] w-full flex-col border-l border-line bg-panel lg:max-h-none lg:w-[360px]">
        <nav className="flex border-b border-line text-xs">
          {(
            [
              ["diario", "Diário"],
              ["pistas", "Pistas"],
              ["ficha", "Ficha"],
              ["inventario", "Itens"],
              ["combate", "Combate"],
              ["dados", "Dados"],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`flex-1 px-1.5 py-2.5 transition ${tab === t ? "border-b-2 border-blood text-bone" : "text-dim hover:text-ash"}`}>
              {label}
              {t === "combate" && inCombat && <span className="ml-1 text-blood">●</span>}
            </button>
          ))}
        </nav>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
          {tab === "diario" && <JournalPanel view={view} />}
          {tab === "pistas" && <CluesPanel view={view} />}
          {tab === "ficha" && <SheetPanel view={view} />}
          {tab === "inventario" && <InventoryPanel view={view} />}
          {tab === "dados" && <DicePanel view={view} />}
          {tab === "combate" && <CombatPanel view={view} disabled={locked} onAction={(action) => send({ action })} />}
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
              disabled={locked}
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

function Stat({ label, v, max, color }: { label: string; v: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100));
  return (
    <div className="w-12 sm:w-14" title={`${label} ${v}/${max}`}>
      <div className="mb-0.5 flex justify-between text-[10px]">
        <span className="text-dim">{label}</span>
        <span className="text-bone">{v}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

type Entry = View["narrative"][number];

function FeedEntry({ entry, rolls }: { entry: Entry; rolls?: RollDetail[] }) {
  const kind = (entry.meta as { kind?: string } | null)?.kind;
  if (entry.role === "PLAYER") {
    return (
      <div className="text-right">
        <p className="inline-block max-w-[85%] whitespace-pre-line rounded-lg bg-raised px-3 py-1.5 text-left text-sm italic text-ash">{entry.content}</p>
      </div>
    );
  }
  if (entry.role === "GM") {
    if (kind === "clarify") return <p className="border-l-2 border-sanity/50 pl-3 text-[15px] italic text-bone">{entry.content}</p>;
    return (
      <div>
        <div className="font-display space-y-2 text-[15.5px] leading-relaxed text-bone">
          {entry.content.split(/\n{2,}|\n(?=—)/).map((p, i) => (
            <p key={i} className={p.startsWith("—") ? "pl-3 text-[#e9dcc3]" : undefined}>
              {p}
            </p>
          ))}
        </div>
        {rolls && rolls.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {rolls.map((r, i) => (
              <span key={i} className={`rounded border px-1.5 py-0.5 font-mono text-[11px] ${r.outcome === "failure" ? "border-blood/40 text-[#ff9a8f]" : r.outcome === "success" || r.outcome === "critical" ? "border-ok/40 text-ok" : "border-line text-ash"}`}>
                🎲 {r.label}: {r.total}
                {r.target !== undefined ? ` vs ${r.target}` : ""}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (kind === "roll_request") return <p className="text-xs text-gold/90">🎲 {entry.content}</p>;
  if (kind === "progress") return <p className="text-xs text-ok">✓ {entry.content}</p>;
  if (kind === "rejected") return <p className="text-xs text-[#ff9a8f]/80">{entry.content}</p>;
  if (kind === "rules") return <p className="whitespace-pre-line rounded-md border border-sanity/30 bg-sanity/5 px-3 py-2 text-xs text-ash">{entry.content}</p>;
  if (kind === "cancelled") return <p className="text-xs text-dim">{entry.content}</p>;
  return <p className="text-xs text-gold/90">{entry.content}</p>;
}

function DecisionBanner({ view, disabled, onDecide }: { view: View; disabled: boolean; onDecide: (optionId: string) => void }) {
  const d = view.blueprint.decision;
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute inset-x-3 bottom-14 mx-auto max-w-2xl rounded-xl border border-gold/40 bg-ink/90 p-3 backdrop-blur" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpen((o) => !o)}>
        <span>
          <span className="block text-[10px] font-semibold uppercase tracking-widest text-gold">Decisão</span>
          <span className="font-display text-base">{d.prompt}</span>
        </span>
        <span className="text-xs text-dim">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
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
      )}
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
