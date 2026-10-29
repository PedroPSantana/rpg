import { notFound, redirect } from "next/navigation";
import { Game } from "@/components/game/game";
import { gmStatus } from "@/modules/gm";
import { getCampaignView, ServiceError, toClientView } from "@/server/campaigns";
import { getDb } from "@/server/db";
import { currentPlayer } from "@/server/player";

export default async function PlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const player = await currentPlayer();
  const view = await getCampaignView(getDb(), player.id, id).catch((e) => {
    if (e instanceof ServiceError && e.status === 404) notFound();
    throw e;
  });
  if (!view.character) redirect(`/campanhas/${id}/personagem`);
  const gm = gmStatus();
  return <Game initial={toClientView(view)} gmLabel={gm.active === "anthropic" ? `IA (${gm.model})` : "Offline (determinístico)"} />;
}
