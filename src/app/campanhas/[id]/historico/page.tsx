import { notFound } from "next/navigation";
import { RollCard } from "@/components/game/panels";
import type { RollDetail } from "@/components/game/types";
import { Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { getCampaignView, ServiceError, toClientView } from "@/server/campaigns";
import { getDb } from "@/server/db";
import { currentPlayer } from "@/server/player";

const timeFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" });

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const player = await currentPlayer();
  const raw = await getCampaignView(getDb(), player.id, id).catch((e) => {
    if (e instanceof ServiceError && e.status === 404) notFound();
    throw e;
  });
  const view = toClientView(raw);
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader eyebrow={view.blueprint.title} title={`Histórico — ${view.campaign.name}`}>
        <ButtonLink href={`/campanhas/${id}/jogar`} variant="primary">
          Voltar ao jogo
        </ButtonLink>
      </PageHeader>
      <div className="mb-6 flex flex-wrap gap-2 text-xs text-dim">
        <Badge>Semente {view.campaign.seed.slice(0, 12)}</Badge>
        <Badge>Versão do estado {view.campaign.version}</Badge>
        <Badge>{view.state.actionCount} ações</Badge>
        {view.state.ending && <Badge tone="gold">Desfecho: {view.state.ending.title}</Badge>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="p-5">
          <h2 className="font-display mb-4 text-xl">Narrativa</h2>
          <ol className="space-y-3">
            {view.narrative.map((n) => (
              <li key={n.id} className="border-l-2 border-line pl-3">
                <p className="text-[10px] uppercase tracking-wider text-dim">
                  {n.role === "GM" ? "Mestre" : n.role === "PLAYER" ? "Agente" : "Sistema"} · {timeFmt.format(new Date(n.createdAt))}
                </p>
                <p className={`whitespace-pre-line text-sm ${n.role === "GM" ? "font-display text-bone" : n.role === "PLAYER" ? "italic text-ash" : "text-gold/90"}`}>{n.content}</p>
              </li>
            ))}
          </ol>
        </Card>
        <div>
          <h2 className="font-display mb-3 text-xl">Rolagens recentes</h2>
          <div className="space-y-2">
            {view.rolls.map((r) => (
              <RollCard key={r.id} roll={r.detail as RollDetail} />
            ))}
            {view.rolls.length === 0 && <p className="text-sm text-dim">Nenhuma rolagem registrada.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
