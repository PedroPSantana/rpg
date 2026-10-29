"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import {
  ATTRIBUTE_INFO,
  ATTRIBUTE_RULES,
  ATTRIBUTES,
  attributeTotals,
  CLASS_BY_ID,
  CLASSES,
  deriveSheet,
  freeSkillAllowance,
  grantedSkills,
  ITEM_BY_ID,
  ITEMS,
  ORIGIN_BY_ID,
  ORIGINS,
  SKILL_BY_ID,
  SKILLS,
  validateBuild,
  type Attribute,
  type OpCharacterBuild,
} from "@/modules/rules/systems/ordem-paranormal";

const STEPS = [
  { id: "conceito", label: "Conceito", fields: ["name", "concept"] },
  { id: "atributos", label: "Atributos", fields: ["attributes"] },
  { id: "origem", label: "Origem", fields: ["originId"] },
  { id: "classe", label: "Classe", fields: ["classId", "classSkillChoices"] },
  { id: "pericias", label: "Perícias", fields: ["freeSkills", "peritoSkills"] },
  { id: "equipamento", label: "Equipamento", fields: ["equipment"] },
  { id: "revisao", label: "Revisão", fields: [] },
] as const;

const EMPTY: OpCharacterBuild = {
  name: "",
  concept: "",
  nex: 5,
  attributes: { AGI: 1, FOR: 1, INT: 1, PRE: 1, VIG: 1 },
  originId: "",
  classId: "",
  classSkillChoices: [],
  freeSkills: [],
  peritoSkills: [],
  equipment: [],
};

export function CharacterCreator({ campaignId, initial, locked }: { campaignId: string; initial: OpCharacterBuild | null; locked: boolean }) {
  const router = useRouter();
  const [build, setBuild] = useState<OpCharacterBuild>(initial ?? EMPTY);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const validation = useMemo(() => validateBuild(build), [build]);
  const issues = validation.ok ? [] : validation.issues;
  const sheet = useMemo(() => (validation.ok ? deriveSheet(validation.build) : null), [validation]);
  const set = (patch: Partial<OpCharacterBuild>) => setBuild((b) => ({ ...b, ...patch }));
  const stepIssues = (i: number) => issues.filter((x) => (STEPS[i].fields as readonly string[]).some((f) => x.field === f || x.field.startsWith(`${f}.`)));

  async function save() {
    setBusy(true);
    setServerError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/character`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(build) });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setServerError(body?.details?.map?.((d: { message: string }) => d.message).join(" ") || body?.error || "Não foi possível salvar.");
      return;
    }
    router.push(`/campanhas/${campaignId}/jogar`);
    router.refresh();
  }

  const current = STEPS[step].id;
  const disabled = locked && current !== "conceito" && current !== "revisao";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <ol className="mb-6 flex flex-wrap gap-1">
          {STEPS.map((s, i) => {
            const bad = stepIssues(i).length > 0;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setStep(i)}
                  className={`rounded-md px-3 py-1.5 text-sm transition ${i === step ? "bg-blood text-bone" : "bg-panel text-ash hover:text-bone"}`}
                >
                  <span className="mr-1 font-mono text-xs opacity-60">{i + 1}</span>
                  {s.label}
                  {bad && <span className="ml-1 text-gold">•</span>}
                </button>
              </li>
            );
          })}
        </ol>

        {locked && (
          <p className="mb-4 rounded-md border border-gold/30 bg-gold/10 px-3 py-2 text-sm text-gold">
            A campanha já começou: as regras do agente estão travadas. Você ainda pode mudar o nome e o conceito.
          </p>
        )}

        <Card className={`p-6 ${disabled ? "pointer-events-none opacity-60" : ""}`}>
          {current === "conceito" && (
            <div className="space-y-4">
              <Field label="Nome do agente">
                <input value={build.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} className={inputCls} placeholder="Ex.: Helena Duarte" />
              </Field>
              <Field label="Conceito (quem é, o que deseja, o que teme)">
                <textarea value={build.concept} onChange={(e) => set({ concept: e.target.value })} maxLength={400} rows={4} className={inputCls} />
              </Field>
              <p className="text-xs text-dim">Nível de exposição paranormal inicial: NEX 5% (Recruta). Outros níveis ainda não são suportados.</p>
            </div>
          )}

          {current === "atributos" && <AttributesStep build={build} set={set} />}

          {current === "origem" && (
            <div className="grid gap-2 sm:grid-cols-2">
              {ORIGINS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  disabled={!o.available}
                  onClick={() => set({ originId: o.id, freeSkills: [], peritoSkills: [] })}
                  className={`rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${build.originId === o.id ? "border-blood bg-blood/10" : "border-line hover:border-ash/50"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{o.name}</span>
                    {!o.available && <Badge>Em breve</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-ash">Perícias: {o.skills.map((s) => SKILL_BY_ID.get(s)?.name ?? s).join(", ")}</p>
                  <p className="mt-1 text-xs text-dim">
                    <span className="text-bone/80">{o.power.name}:</span> {o.available ? o.power.summary : "poder ainda não implementado no motor."}
                  </p>
                </button>
              ))}
            </div>
          )}

          {current === "classe" && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {CLASSES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={!c.available}
                    title={c.unavailableReason}
                    onClick={() => set({ classId: c.id, classSkillChoices: c.fixedSkillChoices.map((g) => g.options[0]), freeSkills: [], peritoSkills: [] })}
                    className={`rounded-lg border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${build.classId === c.id ? "border-blood bg-blood/10" : "border-line hover:border-ash/50"}`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-display text-lg">{c.name}</span>
                      {!c.available && <Badge>Em breve</Badge>}
                    </div>
                    <p className="text-xs text-ash">{c.summary}</p>
                    <p className="mt-2 font-mono text-[11px] text-dim">
                      PV {c.pv.base}+VIG · PE {c.pe.base}+PRE · SAN {c.san.base}
                    </p>
                    {!c.available && <p className="mt-2 text-[11px] text-dim">{c.unavailableReason}</p>}
                  </button>
                ))}
              </div>
              {CLASS_BY_ID.get(build.classId as "combatente")?.fixedSkillChoices.map((g, idx) => (
                <Field key={g.label} label={g.label}>
                  <div className="flex gap-2">
                    {g.options.map((opt) => (
                      <Chip
                        key={opt}
                        active={build.classSkillChoices[idx] === opt}
                        onClick={() => {
                          const next = [...build.classSkillChoices];
                          next[idx] = opt;
                          set({ classSkillChoices: next, freeSkills: build.freeSkills.filter((s) => s !== opt) });
                        }}
                      >
                        {SKILL_BY_ID.get(opt)?.name}
                      </Chip>
                    ))}
                  </div>
                </Field>
              ))}
            </div>
          )}

          {current === "pericias" && <SkillsStep build={build} set={set} />}

          {current === "equipamento" && <EquipmentStep build={build} set={set} />}

          {current === "revisao" && (
            <div className="space-y-3">
              {issues.length === 0 ? (
                <p className="text-ok">Tudo certo. Seu agente está pronto para a investigação.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {issues.map((i, k) => (
                    <li key={k} className="text-[#ff9a8f]">
                      • {i.message} <span className="font-mono text-[10px] text-dim">[{i.ruleId}]</span>
                    </li>
                  ))}
                </ul>
              )}
              {serverError && <p className="text-sm text-[#ff9a8f]">{serverError}</p>}
            </div>
          )}

          {current !== "revisao" && stepIssues(step).length > 0 && (
            <ul className="mt-5 space-y-1 border-t border-line pt-4 text-sm">
              {stepIssues(step).map((i, k) => (
                <li key={k} className="text-gold">
                  • {i.message}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="mt-4 flex justify-between">
          <Button variant="quiet" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            ← Voltar
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)}>Avançar →</Button>
          ) : (
            <Button variant="primary" disabled={!validation.ok || busy} onClick={save}>
              {busy ? "Salvando…" : locked ? "Salvar e voltar ao jogo" : "Salvar agente e jogar"}
            </Button>
          )}
        </div>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <SheetPreview build={build} sheet={sheet} />
      </aside>
    </div>
  );
}

const inputCls = "w-full rounded-md border border-line bg-ink px-3 py-2 outline-none focus:border-gold";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-ash">{label}</span>
      {children}
    </label>
  );
}

function Chip({ active, disabled, onClick, children, title }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`rounded-full border px-3 py-1 text-sm transition disabled:cursor-not-allowed disabled:opacity-35 ${active ? "border-blood bg-blood/20 text-bone" : "border-line text-ash hover:border-ash/60 hover:text-bone"}`}
    >
      {children}
    </button>
  );
}

type StepProps = { build: OpCharacterBuild; set: (p: Partial<OpCharacterBuild>) => void };

function AttributesStep({ build, set }: StepProps) {
  const totals = attributeTotals(build.attributes);
  const change = (a: Attribute, delta: number) => set({ attributes: { ...build.attributes, [a]: build.attributes[a] + delta }, freeSkills: [] });
  return (
    <div>
      <p className="mb-4 text-sm text-ash">
        Todos começam em {ATTRIBUTE_RULES.base}. Distribua {ATTRIBUTE_RULES.pointsToDistribute} pontos (máximo {ATTRIBUTE_RULES.maxAtCreation} por atributo). Você pode reduzir um
        atributo a 0 para ganhar 1 ponto extra.
      </p>
      <p className="mb-4 font-mono text-sm">
        Pontos restantes: <span className={totals.remaining === 0 ? "text-ok" : "text-gold"}>{totals.remaining}</span>
      </p>
      <div className="grid gap-3 sm:grid-cols-5">
        {ATTRIBUTES.map((a) => (
          <div key={a} className="rounded-lg border border-line bg-ink/60 p-3 text-center">
            <div className="text-xs font-bold tracking-widest text-blood">{a}</div>
            <div className="text-[11px] text-ash">{ATTRIBUTE_INFO[a].name}</div>
            <div className="font-display my-2 text-4xl">{build.attributes[a]}</div>
            <div className="flex justify-center gap-1">
              <Button variant="quiet" className="px-2 py-0.5" disabled={build.attributes[a] <= 0 || (build.attributes[a] === 1 && totals.zeros >= ATTRIBUTE_RULES.maxReducedToZero)} onClick={() => change(a, -1)} aria-label={`Diminuir ${a}`}>
                −
              </Button>
              <Button variant="quiet" className="px-2 py-0.5" disabled={build.attributes[a] >= ATTRIBUTE_RULES.maxAtCreation || totals.remaining <= 0} onClick={() => change(a, 1)} aria-label={`Aumentar ${a}`}>
                +
              </Button>
            </div>
            <p className="mt-2 text-[10px] leading-tight text-dim">{ATTRIBUTE_INFO[a].hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SkillsStep({ build, set }: StepProps) {
  const granted = grantedSkills(build).skills;
  const allowance = freeSkillAllowance(build);
  const isEsp = build.classId === "especialista";
  const trained = new Set([...granted, ...build.freeSkills]);
  if (!build.classId || !build.originId) return <p className="text-ash">Escolha origem e classe antes das perícias.</p>;
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-3 text-sm text-ash">
          Já treinadas pela origem/classe: <span className="text-bone">{[...granted].map((s) => SKILL_BY_ID.get(s)?.name).join(", ")}</span>
        </p>
        <p className="mb-3 font-mono text-sm">
          Escolhas livres: {build.freeSkills.length}/{allowance}
        </p>
        <div className="flex flex-wrap gap-2">
          {SKILLS.map((s) => {
            const on = build.freeSkills.includes(s.id);
            return (
              <Chip
                key={s.id}
                active={on || granted.has(s.id)}
                disabled={granted.has(s.id) || (!on && build.freeSkills.length >= allowance)}
                onClick={() =>
                  set({
                    freeSkills: on ? build.freeSkills.filter((x) => x !== s.id) : [...build.freeSkills, s.id],
                    peritoSkills: on ? build.peritoSkills.filter((x) => x !== s.id) : build.peritoSkills,
                  })
                }
              >
                {s.name} <span className="text-[10px] opacity-60">{s.attribute}</span>
              </Chip>
            );
          })}
        </div>
      </div>
      {isEsp && (
        <div>
          <p className="mb-2 text-sm text-ash">Perito: escolha duas perícias treinadas (exceto Luta e Pontaria). Ao usá-las, gaste 2 PE para somar +1d6.</p>
          <div className="flex flex-wrap gap-2">
            {[...trained]
              .filter((s) => s !== "luta" && s !== "pontaria")
              .map((s) => {
                const on = build.peritoSkills.includes(s);
                return (
                  <Chip key={s} active={on} disabled={!on && build.peritoSkills.length >= 2} onClick={() => set({ peritoSkills: on ? build.peritoSkills.filter((x) => x !== s) : [...build.peritoSkills, s] })}>
                    {SKILL_BY_ID.get(s)?.name}
                  </Chip>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

function EquipmentStep({ build, set }: StepProps) {
  const cls = CLASS_BY_ID.get(build.classId as "combatente");
  return (
    <div>
      <p className="mb-4 text-sm text-ash">
        Como Recruta, você pode levar até 2 itens de categoria I, além de itens de categoria 0. A carga é limitada pela sua Força. Apenas itens implementados no motor de
        regras aparecem aqui.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {ITEMS.map((item) => {
          const on = build.equipment.includes(item.id);
          const prof = item.kind === "gear" || !cls || (cls.proficiencies as string[]).includes(item.proficiency);
          return (
            <button
              key={item.id}
              type="button"
              disabled={!prof}
              onClick={() => set({ equipment: on ? build.equipment.filter((x) => x !== item.id) : [...build.equipment, item.id] })}
              className={`rounded-lg border p-3 text-left text-sm transition disabled:opacity-35 ${on ? "border-blood bg-blood/10" : "border-line hover:border-ash/50"}`}
            >
              <div className="flex justify-between gap-2">
                <span className="font-medium">{item.name}</span>
                <span className="font-mono text-[11px] text-dim">
                  cat. {item.category === 0 ? "0" : "I".repeat(item.category)} · {item.spaces} esp.
                </span>
              </div>
              <p className="mt-1 text-xs text-ash">
                {item.kind === "weapon" && `Dano ${item.damage} · crítico ${item.critThreshold}/x${item.critMultiplier} · ${item.firearm ? "fogo" : "corpo a corpo"}`}
                {item.kind === "protection" && `+${item.defense} Defesa`}
                {item.kind === "gear" && item.description}
              </p>
              {!prof && <p className="mt-1 text-[11px] text-dim">Sem proficiência.</p>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SheetPreview({ build, sheet }: { build: OpCharacterBuild; sheet: ReturnType<typeof deriveSheet> | null }) {
  const origin = ORIGIN_BY_ID.get(build.originId);
  const cls = CLASS_BY_ID.get(build.classId as "combatente");
  return (
    <Card className="p-5">
      <p className="text-xs uppercase tracking-widest text-dim">Pré-visualização</p>
      <h3 className="font-display mt-1 text-2xl">{build.name || "Agente sem nome"}</h3>
      <p className="text-sm text-ash">
        {[origin?.name, cls?.name, `NEX ${build.nex}%`].filter(Boolean).join(" · ")}
      </p>
      {sheet ? (
        <>
          <div className="my-4 grid grid-cols-3 gap-2 text-center">
            <Stat label="PV" value={sheet.pvMax} color="text-blood" />
            <Stat label="PE" value={sheet.peMax} color="text-effort" />
            <Stat label="SAN" value={sheet.sanMax} color="text-sanity" />
            <Stat label="Defesa" value={sheet.defense} />
            <Stat label="Limite PE" value={sheet.peLimit} />
            <Stat label="Carga" value={`${sheet.load.used}/${sheet.load.capacity}`} />
          </div>
          <p className="mb-1 text-xs font-semibold text-ash">Perícias treinadas</p>
          <p className="mb-3 text-xs text-bone/80">
            {sheet.skills
              .filter((s) => s.grade !== "untrained")
              .map((s) => `${s.name} +${s.bonus}`)
              .join(", ")}
          </p>
          <p className="mb-1 text-xs font-semibold text-ash">Habilidades</p>
          <ul className="space-y-1 text-xs text-bone/80">
            {sheet.abilities.map((a) => (
              <li key={a.id}>
                <span className="text-bone">{a.name}:</span> {a.summary}
              </li>
            ))}
          </ul>
          <p className="mt-3 mb-1 text-xs font-semibold text-ash">Ataques</p>
          <ul className="text-xs text-bone/80">
            {sheet.attacks.map((a) => (
              <li key={a.weaponId}>
                {a.name}: {a.damage}
                {a.damageBonus ? `+${a.damageBonus}` : ""} ({SKILL_BY_ID.get(a.skill)?.name}) {!a.proficient && "· sem proficiência"}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-dim">Itens: {build.equipment.map((i) => ITEM_BY_ID.get(i)?.name).join(", ") || "nenhum"}</p>
        </>
      ) : (
        <p className="mt-4 text-sm text-dim">Complete as escolhas válidas para ver os valores derivados.</p>
      )}
    </Card>
  );
}

function Stat({ label, value, color = "text-bone" }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="rounded-md border border-line bg-ink/60 py-2">
      <div className={`font-display text-xl ${color}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-dim">{label}</div>
    </div>
  );
}
