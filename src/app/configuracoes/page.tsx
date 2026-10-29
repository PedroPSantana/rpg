import { Badge, Card, PageHeader } from "@/components/ui";
import { gmStatus } from "@/modules/gm";
import { RULES_SYSTEMS } from "@/modules/rules/registry";

export default function SettingsPage() {
  const gm = gmStatus();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader eyebrow="Sistema" title="Configurações" />
      <div className="space-y-4">
        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-xl">Mestre</h2>
            <Badge tone={gm.active === "anthropic" ? "green" : "gold"}>{gm.active === "anthropic" ? "IA ativa" : "Modo offline"}</Badge>
          </div>
          <dl className="space-y-1 text-sm">
            <Row k="Provedor solicitado (GM_PROVIDER)" v={gm.wanted} />
            <Row k="Provedor em uso" v={gm.active === "anthropic" ? `Anthropic · ${gm.model}` : "Offline determinístico"} />
            <Row k="Chave de API configurada" v={gm.hasKey ? "Sim (nunca enviada ao navegador)" : "Não"} />
          </dl>
          <p className="mt-3 text-xs text-dim">
            A IA interpreta suas ações e narra, mas nunca decide regras, dados ou estado: tudo isso é resolvido e validado pelo servidor. Sem chave (ou se a IA falhar), o
            mestre offline mantém o jogo funcionando. Configure em <code className="font-mono">.env</code>: <code className="font-mono">GM_PROVIDER=&quot;anthropic&quot;</code> e{" "}
            <code className="font-mono">ANTHROPIC_API_KEY</code>. O provedor Anthropic usa fallback de modelo do lado do servidor quando uma resposta é recusada.
          </p>
        </Card>
        <Card className="p-5">
          <h2 className="font-display mb-2 text-xl">Sistemas de regras</h2>
          <ul className="space-y-2 text-sm">
            {RULES_SYSTEMS.map((s) => (
              <li key={s.id} className="flex items-center justify-between">
                <span>{s.name}</span>
                <Badge tone={s.availability === "available" ? "green" : "neutral"}>{s.availability === "available" ? s.editions.map((e) => e.name).join(", ") : "Em breve"}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5 text-sm text-ash">
          <h2 className="font-display mb-2 text-xl text-bone">Identidade e privacidade</h2>
          <p>
            Esta instalação identifica você por um cookie anônimo neste navegador; cada campanha pertence a esse identificador. Não é um sistema de login: para uso com
            várias pessoas em rede, veja <code className="font-mono">docs/architecture.md</code>.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ash">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}
