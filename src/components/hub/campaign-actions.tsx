"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

export function CampaignActions({ id, name, archived }: { id: string; name: string; archived: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: "PATCH" | "DELETE", body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${id}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    setBusy(false);
    if (!res.ok) setError((await res.json().catch(() => null))?.error ?? "Falha na operação.");
    else router.refresh();
  }

  return (
    <div className="ml-auto flex items-center gap-1">
      <Button
        variant="quiet"
        disabled={busy}
        onClick={() => {
          const next = window.prompt("Novo nome da campanha:", name);
          if (next && next.trim() && next !== name) call("PATCH", { name: next });
        }}
      >
        Renomear
      </Button>
      <Button variant="quiet" disabled={busy} onClick={() => call("PATCH", { archived: !archived })}>
        {archived ? "Desarquivar" : "Arquivar"}
      </Button>
      <Button
        variant="danger"
        disabled={busy}
        onClick={() => {
          if (window.confirm(`Excluir "${name}" permanentemente? Todo o progresso será perdido.`)) call("DELETE");
        }}
      >
        Excluir
      </Button>
      {error && <span className="text-xs text-[#ff9a8f]">{error}</span>}
    </div>
  );
}
