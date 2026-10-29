"use client";

import { useEffect, useState } from "react";
import { Badge, Card } from "@/components/ui";

interface Hit {
  id: string;
  title: string;
  summary: string;
  citation: string;
  verificationStatus: string;
  implementationStatus: string;
}

export function RuleSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) return setHits([]);
      const res = await fetch(`/api/knowledge/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setHits((await res.json()).hits);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ex.: como funciona um teste de perícia? dano de sanidade? margem de ameaça?"
        className="mb-3 w-full rounded-md border border-line bg-ink px-3 py-2 outline-none focus:border-gold"
      />
      <div className="space-y-2">
        {q.trim() && hits.length === 0 && <p className="text-sm text-dim">Nada encontrado no catálogo. O mestre não inventa respostas oficiais para regras fora dele.</p>}
        {hits.map((h) => (
          <Card key={h.id} className="p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{h.title}</span>
              <Badge>{h.verificationStatus === "unverified" ? "Não verificada" : h.verificationStatus}</Badge>
            </div>
            <p className="mt-1 text-ash">{h.summary}</p>
            <p className="mt-1 font-mono text-[10px] text-dim">{h.citation}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
