"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import type { EditionDescriptor } from "@/modules/rules/core/system";

interface SystemOption {
  id: string;
  name: string;
  availability: "available" | "planned";
  editions: EditionDescriptor[];
}

export function NewCampaignForm({ systems }: { systems: SystemOption[] }) {
  const router = useRouter();
  const firstAvailable = systems.find((s) => s.availability === "available");
  const [systemId, setSystemId] = useState(firstAvailable?.id ?? "");
  const system = systems.find((s) => s.id === systemId);
  const [editionId, setEditionId] = useState(firstAvailable?.editions.find((e) => e.available)?.id ?? "");
  const [name, setName] = useState("");
  const [seed, setSeed] = useState("");
  const [showSeed, setShowSeed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, systemId, editionId, seed: seed.trim() || undefined }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setBusy(false);
      setError(body?.error ?? "Não foi possível criar a campanha.");
      return;
    }
    router.push(`/campanhas/${body.id}/personagem`);
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-ash">1. Sistema de regras</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {systems.map((s) => {
            const disabled = s.availability !== "available";
            const selected = s.id === systemId;
            return (
              <button
                key={s.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  setSystemId(s.id);
                  setEditionId(s.editions.find((e) => e.available)?.id ?? "");
                }}
                className={`rounded-xl border p-4 text-left transition ${selected ? "border-blood bg-blood/10" : "border-line bg-panel hover:border-ash/50"} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-display text-lg">{s.name}</span>
                  {disabled ? <Badge>Em breve</Badge> : <Badge tone="green">Disponível</Badge>}
                </div>
                <p className="text-xs text-ash">{disabled ? "Arquitetura preparada; regras ainda não implementadas." : "Horror investigativo contemporâneo."}</p>
              </button>
            );
          })}
        </div>
      </section>

      {system && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-ash">2. Edição</h2>
          <div className="space-y-2">
            {system.editions.map((e) => (
              <label key={e.id} className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${editionId === e.id ? "border-blood bg-blood/10" : "border-line bg-panel"}`}>
                <input type="radio" className="mt-1 accent-[#b3261e]" checked={editionId === e.id} disabled={!e.available} onChange={() => setEditionId(e.id)} />
                <span>
                  <span className="block font-medium">{e.name}</span>
                  <span className="block text-sm text-ash">{e.description}</span>
                  {e.confirmedBy && (
                    <span className="mt-1 block text-xs text-dim">
                      Edição confirmada por {e.confirmedBy.who} em {new Date(e.confirmedBy.date).toLocaleDateString("pt-BR")}.
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-ash">3. Identificação</h2>
        <Card className="space-y-4 p-5">
          <label className="block">
            <span className="mb-1 block text-sm text-ash">Nome da campanha (opcional — usamos o título do caso se vazio)</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="Ex.: Arquivo 07 — Interior de Minas"
              className="w-full rounded-md border border-line bg-ink px-3 py-2 outline-none focus:border-gold"
            />
          </label>
          <button type="button" className="text-xs text-dim underline-offset-2 hover:underline" onClick={() => setShowSeed((v) => !v)}>
            {showSeed ? "Ocultar semente" : "Avançado: definir semente"}
          </button>
          {showSeed && (
            <label className="block">
              <span className="mb-1 block text-sm text-ash">Semente (reproduz a mesma aventura; deixe vazio para uma aleatória)</span>
              <input value={seed} onChange={(e) => setSeed(e.target.value)} maxLength={120} className="w-full rounded-md border border-line bg-ink px-3 py-2 font-mono text-sm outline-none focus:border-gold" />
            </label>
          )}
        </Card>
      </section>

      {error && <p className="text-sm text-[#ff9a8f]">{error}</p>}
      <div className="flex justify-end">
        <Button variant="primary" disabled={!systemId || !editionId || busy} onClick={submit} className="px-6 py-2.5 text-base">
          {busy ? "Gerando o mistério…" : "Gerar campanha"}
        </Button>
      </div>
    </div>
  );
}
