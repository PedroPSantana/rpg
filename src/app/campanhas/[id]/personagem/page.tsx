import { notFound } from "next/navigation";
import { CharacterCreator } from "@/components/creator/character-creator";
import { PageHeader } from "@/components/ui";
import { getCampaignView, ServiceError } from "@/server/campaigns";
import { getDb } from "@/server/db";
import { currentPlayer } from "@/server/player";

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const player = await currentPlayer();
  const view = await getCampaignView(getDb(), player.id, id).catch((e) => {
    if (e instanceof ServiceError && e.status === 404) notFound();
    throw e;
  });
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <PageHeader eyebrow={view.blueprint.title} title={view.character ? "Ficha do agente" : "Criar agente"} />
      <p className="-mt-4 mb-8 max-w-3xl text-sm text-ash">{view.blueprint.premise}</p>
      <CharacterCreator campaignId={id} initial={view.character?.build ?? null} locked={!!view.character && view.state.actionCount > 0} />
    </div>
  );
}
