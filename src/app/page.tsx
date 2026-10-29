import { CampaignActions } from "@/components/hub/campaign-actions";
import { Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { listCampaigns } from "@/server/campaigns";
import { getDb } from "@/server/db";
import { currentPlayer } from "@/server/player";

const STATUS = {
  ACTIVE: { label: "Em andamento", tone: "gold" },
  COMPLETED: { label: "Concluída", tone: "green" },
  ARCHIVED: { label: "Arquivada", tone: "neutral" },
} as const;

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" });

export default async function HubPage() {
  const player = await currentPlayer();
  const campaigns = await listCampaigns(getDb(), player.id);
  const active = campaigns.filter((c) => c.status !== "ARCHIVED");
  const archived = campaigns.filter((c) => c.status === "ARCHIVED");

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <section className="grain relative mb-12 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-[#1d1418] via-night to-ink p-8 sm:p-12">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-blood">Horror investigativo · Mestre IA</p>
        <h1 className="font-display max-w-2xl text-4xl leading-tight sm:text-5xl">O Outro Lado está mais perto do que parece.</h1>
        <p className="mt-4 max-w-xl text-ash">
          Cada campanha gera um mistério original, com locais 3D que guardam as marcas das suas escolhas. O mestre narra; as regras, os dados e o estado do mundo são
          resolvidos por software verificável.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/campanhas/nova" variant="primary" className="px-5 py-2.5 text-base">
            Nova campanha
          </ButtonLink>
          <ButtonLink href="/conhecimento">Ver regras e cobertura</ButtonLink>
        </div>
      </section>

      <PageHeader eyebrow="Seus arquivos" title="Campanhas" />
      {active.length === 0 && (
        <Card className="p-8 text-center text-ash">Nenhuma campanha ainda. Comece uma nova investigação para abrir seu primeiro arquivo.</Card>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {active.map((c) => (
          <CampaignCard key={c.id} c={c} />
        ))}
      </div>

      {archived.length > 0 && (
        <>
          <h2 className="font-display mt-12 mb-4 text-xl text-ash">Arquivadas</h2>
          <div className="grid gap-4 opacity-80 md:grid-cols-2 xl:grid-cols-3">
            {archived.map((c) => (
              <CampaignCard key={c.id} c={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CampaignCard({ c }: { c: Awaited<ReturnType<typeof listCampaigns>>[number] }) {
  const status = STATUS[c.status];
  const next = c.characterName ? `/campanhas/${c.id}/jogar` : `/campanhas/${c.id}/personagem`;
  return (
    <Card className="flex flex-col p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display truncate text-xl">{c.name}</h3>
          <p className="truncate text-xs text-dim">
            {c.title} · {c.city}
          </p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <p className="mb-4 line-clamp-3 flex-1 text-sm text-ash">{c.premise}</p>
      <dl className="mb-4 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-dim">Agente</dt>
          <dd className="truncate">{c.characterName ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-dim">Atualizada</dt>
          <dd>{dateFmt.format(new Date(c.updatedAt))}</dd>
        </div>
        {c.ending && (
          <div className="col-span-2">
            <dt className="text-dim">Desfecho</dt>
            <dd>{c.ending}</dd>
          </div>
        )}
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        {c.status !== "ARCHIVED" && (
          <ButtonLink href={next} variant="primary">
            {c.characterName ? (c.status === "COMPLETED" ? "Rever" : "Continuar") : "Criar agente"}
          </ButtonLink>
        )}
        <ButtonLink href={`/campanhas/${c.id}/historico`} variant="quiet">
          Histórico
        </ButtonLink>
        <CampaignActions id={c.id} name={c.name} archived={c.status === "ARCHIVED"} />
      </div>
    </Card>
  );
}
