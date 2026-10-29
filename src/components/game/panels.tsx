"use client";

import { Badge, Button, Meter } from "@/components/ui";
import { SKILL_BY_ID } from "@/modules/rules/systems/ordem-paranormal/data";
import type { RollDetail, View } from "./types";

const OUTCOME = {
  success: { label: "Sucesso", tone: "green" },
  critical: { label: "Crítico", tone: "gold" },
  failure: { label: "Falha", tone: "red" },
  none: { label: "", tone: "neutral" },
} as const;

export function JournalPanel({ view }: { view: View }) {
  const { blueprint: bp, state } = view;
  const found = bp.clues.filter((c) => state.clues[c.id]?.discovered);
  const metNpcs = bp.npcs.filter((n) => state.npcs[n.id]?.talked);
  return (
    <div className="space-y-6 text-sm">
      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-widest text-blood">Caso</h3>
        <p className="font-display text-lg leading-snug">{bp.title}</p>
        <p className="mt-1 text-ash">{bp.premise}</p>
        <p className="mt-1 text-xs text-dim">
          {bp.setting.place}, {bp.setting.city} · {bp.setting.time}
        </p>
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-ash">Missões</h3>
        <ul className="space-y-3">
          {bp.quests.map((q) => {
            const qs = state.quests[q.id];
            return (
              <li key={q.id}>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{q.title}</span>
                  {q.optional && <Badge>Opcional</Badge>}
                  {qs?.status === "completed" && <Badge tone="green">Concluída</Badge>}
                  {qs?.status === "failed" && <Badge tone="red">Falhou</Badge>}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {q.objectives.map((o) => (
                    <li key={o.id} className={qs?.objectives[o.id] ? "text-dim line-through" : "text-ash"}>
                      {qs?.objectives[o.id] ? "✓" : "○"} {o.text}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-ash">
          Pistas ({found.length}/{bp.clues.length})
        </h3>
        {found.length === 0 && <p className="text-dim">Nenhuma pista ainda. Examine o ambiente e converse com as pessoas.</p>}
        <ul className="space-y-2">
          {found.map((c) => (
            <li key={c.id} className="rounded-md border border-line bg-ink/50 p-2">
              <p className="font-medium text-gold">{c.title}</p>
              <p className="text-xs text-ash">{c.description}</p>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-ash">Hipóteses</h3>
        <ul className="space-y-1.5">
          {bp.hypotheses.map((h) => (
            <li key={h.id} className="flex items-start gap-2">
              <Badge tone={h.status === "supported" ? "green" : "neutral"}>{h.status === "supported" ? "Apoiada" : "Em aberto"}</Badge>
              <span className="text-ash">{h.text}</span>
            </li>
          ))}
        </ul>
      </section>
      {metNpcs.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-ash">Pessoas</h3>
          <ul className="space-y-1">
            {metNpcs.map((n) => (
              <li key={n.id}>
                <span className="text-bone">{n.name}</span> <span className="text-dim">— {n.role}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-[11px] text-dim">O relógio de urgência é um procedimento original deste projeto, não uma regra oficial.</p>
    </div>
  );
}

export function SheetPanel({ view }: { view: View }) {
  const { sheet, state, name, build } = view.character!;
  return (
    <div className="space-y-5 text-sm">
      <div>
        <p className="font-display text-xl">{name}</p>
        <p className="text-xs text-ash">
          {sheet.originName} · {sheet.className} · NEX {sheet.nex}% · {sheet.patente}
        </p>
        {build.concept && <p className="mt-1 text-xs text-dim">{build.concept}</p>}
      </div>
      <div className="space-y-2">
        <Meter label="Pontos de Vida" value={state.pv} max={sheet.pvMax} color="#b3261e" />
        <Meter label="Sanidade" value={state.san} max={sheet.sanMax} color="#7b8fe0" />
        <Meter label="Pontos de Esforço" value={state.pe} max={sheet.peMax} color="#d6a55a" />
      </div>
      {state.conditions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {state.conditions.map((c) => (
            <Badge key={c.id} tone="red">
              {c.id}
            </Badge>
          ))}
        </div>
      )}
      <div className="grid grid-cols-5 gap-1 text-center">
        {Object.entries(sheet.attributes).map(([k, v]) => (
          <div key={k} className="rounded border border-line bg-ink/50 py-1.5">
            <div className="text-[10px] font-bold text-blood">{k}</div>
            <div className="font-display text-lg">{v}</div>
          </div>
        ))}
      </div>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <Stat k="Defesa" v={sheet.defense} />
        <Stat k="Limite de PE" v={sheet.peLimit} />
        <Stat k="Deslocamento" v={`${sheet.speedMeters} m`} />
        <Stat k="Resist. mental" v={`+${sheet.mentalResistance}`} />
        <Stat k="Carga" v={`${sheet.load.used}/${sheet.load.capacity}`} />
      </dl>
      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-widest text-ash">Perícias</h4>
        <ul className="grid grid-cols-2 gap-x-3 text-xs">
          {sheet.skills.map((s) => (
            <li key={s.id} className={`flex justify-between ${s.grade === "untrained" ? "text-dim" : "text-bone"}`}>
              <span>
                {s.name}
                {s.trainedOnly && s.grade === "untrained" && "*"}
              </span>
              <span className="font-mono">
                {s.attribute} {s.bonus ? `+${s.bonus}` : ""}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[10px] text-dim">* só pode ser usada se treinada.</p>
      </div>
      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-widest text-ash">Habilidades</h4>
        <ul className="space-y-1 text-xs">
          {sheet.abilities.map((a) => (
            <li key={a.id}>
              <span className="text-bone">{a.name}.</span> <span className="text-ash">{a.summary}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="rounded border border-line bg-ink/50 p-1.5">
      <dt className="text-[10px] text-dim">{k}</dt>
      <dd className="font-mono">{v}</dd>
    </div>
  );
}

export function InventoryPanel({ view }: { view: View }) {
  const { state, sheet } = view.character!;
  return (
    <div className="space-y-4 text-sm">
      <ul className="space-y-2">
        {state.inventory
          .filter((i) => i.quantity > 0)
          .map((i) => (
            <li key={i.itemId} className="flex items-center justify-between rounded-md border border-line bg-ink/50 px-3 py-2">
              <span>
                {i.name} {i.quantity > 1 && <span className="text-dim">×{i.quantity}</span>}
              </span>
              <span className="flex gap-1">
                {i.equipped && <Badge tone="gold">Equipado</Badge>}
                {i.story && <Badge tone="blue">Da história</Badge>}
              </span>
            </li>
          ))}
      </ul>
      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-widest text-ash">Ataques</h4>
        <ul className="space-y-1 text-xs">
          {sheet.attacks.map((a) => (
            <li key={a.weaponId} className="flex justify-between">
              <span>{a.name}</span>
              <span className="font-mono text-ash">
                {SKILL_BY_ID.get(a.skill)?.name} · {a.damage}
                {a.damageBonus ? `+${a.damageBonus}` : ""} · {a.critThreshold}/x{a.critMultiplier}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function RollCard({ roll }: { roll: RollDetail }) {
  const o = OUTCOME[roll.outcome] ?? OUTCOME.none;
  const mods = roll.modifiers.reduce((s, m) => s + m.value, 0);
  return (
    <div className="rounded-md border border-line bg-ink/50 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-ash">{roll.label}</span>
        {o.label && <Badge tone={o.tone}>{o.label}</Badge>}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {roll.dice.map((d, i) => (
          <span
            key={i}
            title={`d${d.sides}`}
            className={`grid size-7 place-items-center rounded font-mono text-xs ${d.kept ? (d.sides === 20 && d.value === 20 ? "bg-gold text-ink" : d.sides === 20 && d.value === 1 ? "bg-blood text-bone" : "bg-raised text-bone") : "bg-ink text-dim line-through"}`}
          >
            {d.value}
          </span>
        ))}
        {mods !== 0 && <span className="font-mono text-xs text-ash">{mods > 0 ? `+${mods}` : mods}</span>}
        <span className="ml-auto font-display text-xl">{roll.total}</span>
        {roll.target !== undefined && <span className="text-xs text-dim">vs {roll.target}</span>}
      </div>
      <p className="mt-1 font-mono text-[10px] text-dim">
        {roll.expression}
        {roll.modifiers.map((m) => ` · ${m.source} ${m.value >= 0 ? "+" : ""}${m.value}`).join("")}
      </p>
      {roll.notes.length > 0 && <p className="mt-0.5 text-[10px] text-dim">{roll.notes.join(" ")}</p>}
    </div>
  );
}

export function DicePanel({ view }: { view: View }) {
  if (!view.rolls.length) return <p className="text-sm text-dim">Nenhuma rolagem ainda. Todos os dados são rolados pelo servidor e registrados aqui.</p>;
  return (
    <div className="space-y-2">
      {view.rolls.map((r) => (
        <RollCard key={r.id} roll={r.detail as RollDetail} />
      ))}
    </div>
  );
}

export function CombatPanel({ view, disabled, onAction }: { view: View; disabled: boolean; onAction: (a: Record<string, unknown>) => void }) {
  const enc = view.state.encounter;
  const sheet = view.character!.sheet;
  const hasSpecial = sheet.abilities.some((a) => a.id === "ataque-especial");
  if (!enc) {
    const last = Object.entries(view.state.encountersResolved);
    return (
      <div className="space-y-3 text-sm text-dim">
        <p>Nenhum combate em andamento.</p>
        {last.map(([id, outcome]) => (
          <p key={id}>
            Confronto anterior: <span className="text-ash">{outcome === "victory" ? "vitória" : outcome === "fled" ? "fuga" : "derrota"}</span>
          </p>
        ))}
        <Button disabled={disabled || view.state.mode === "ended"} onClick={() => onAction({ type: "first_aid" })}>
          Primeiros socorros (Medicina DT 15)
        </Button>
      </div>
    );
  }
  const threat = view.blueprint.threats.find((t) => t.id === enc.threatId);
  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-xs uppercase tracking-widest text-blood">Rodada {enc.round}</p>
        <p className="font-display text-xl">{threat?.name ?? "Ameaça"}</p>
        <div className="mt-2">
          <Meter label="Ameaça" value={enc.threat.pv} max={enc.threat.pvMax} color="#e0603a" />
        </div>
      </div>
      <ol className="space-y-1 text-xs">
        {enc.order.map((o, i) => (
          <li key={o.id} className={`flex justify-between rounded px-2 py-1 ${i === enc.turnIndex ? "bg-raised text-bone" : "text-ash"}`}>
            <span>{o.name}</span>
            <span className="font-mono">Iniciativa {o.initiative}</span>
          </li>
        ))}
      </ol>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-ash">Sua ação</p>
        {sheet.attacks.map((a) => (
          <div key={a.weaponId} className="flex flex-wrap gap-1">
            <Button variant="primary" disabled={disabled} className="px-2.5 py-1 text-xs" onClick={() => onAction({ type: "attack", weaponId: a.weaponId, special: "none" })}>
              Atacar: {a.name}
            </Button>
            {hasSpecial && (
              <>
                <Button disabled={disabled} className="px-2 py-1 text-xs" onClick={() => onAction({ type: "attack", weaponId: a.weaponId, special: "ataque" })} title="Ataque Especial: 2 PE para +5 no teste">
                  +5 ataque
                </Button>
                <Button disabled={disabled} className="px-2 py-1 text-xs" onClick={() => onAction({ type: "attack", weaponId: a.weaponId, special: "dano" })} title="Ataque Especial: 2 PE para +5 no dano">
                  +5 dano
                </Button>
              </>
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-1">
          <Button disabled={disabled} className="px-2.5 py-1 text-xs" onClick={() => onAction({ type: "flee", skillId: "atletismo" })}>
            Fugir (Atletismo)
          </Button>
          <Button disabled={disabled} className="px-2.5 py-1 text-xs" onClick={() => onAction({ type: "flee", skillId: "acrobacia" })}>
            Fugir (Acrobacia)
          </Button>
          <Button disabled={disabled} className="px-2.5 py-1 text-xs" onClick={() => onAction({ type: "first_aid" })}>
            Primeiros socorros
          </Button>
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-ash">Registro de combate</p>
        <ul className="space-y-1 text-xs text-ash">
          {enc.log
            .slice()
            .reverse()
            .map((l, i) => (
              <li key={i} className="border-l-2 border-line pl-2">
                {l}
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
