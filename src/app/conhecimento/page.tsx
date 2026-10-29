import { RuleSearch } from "@/components/knowledge/rule-search";
import { Badge, Card, PageHeader } from "@/components/ui";
import { coverageSummary, ruleCoverage, type TestCoverageStatus } from "@/modules/knowledge/coverage";
import { ALL_RULES, IMPLEMENTATION_LABELS, SOURCES, sourceTitle, VERIFICATION_LABELS } from "@/modules/knowledge";
import { getDb } from "@/server/db";
import { readReport, readTestReport } from "@/server/reports";

const TEST_LABELS: Record<TestCoverageStatus, string> = {
  passing: "Testes passando",
  failing: "Testes falhando",
  no_tests: "Sem testes",
  not_run: "Testes não executados",
  missing_ref: "Referência de teste ausente",
};

const ACCESS_LABELS = { accessible: "Acessível", requires_owner_document: "Requer exemplar do proprietário", unavailable: "Indisponível" } as const;

interface EvalReport {
  generatedAt: string;
  metrics: { id: string; label: string; value: number; target: number; unit: string; passed: boolean }[];
}

async function chunkCounts() {
  try {
    const rows = await getDb().sourceChunk.groupBy({ by: ["sourceId"], _count: { _all: true } });
    return Object.fromEntries(rows.map((r) => [r.sourceId, r._count._all]));
  } catch {
    return null;
  }
}

export default async function KnowledgePage() {
  const [report, evals, chunks] = await Promise.all([readTestReport(), readReport<EvalReport>("evals.json"), chunkCounts()]);
  const coverage = ruleCoverage(ALL_RULES, report?.data ?? null);
  const summary = coverageSummary(coverage);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <PageHeader eyebrow="Base de conhecimento" title="Regras, fontes e cobertura" />
      <p className="-mt-4 mb-8 max-w-3xl text-sm text-ash">
        Cada regra tem quatro estados independentes: ingestão do texto-fonte, verificação humana, implementação no motor e testes automatizados. Um não implica o outro. Os
        resumos são paráfrases originais; nenhum texto do livro é reproduzido.
      </p>

      <div className="mb-10 grid gap-4 md:grid-cols-4">
        <SummaryCard title="Ingestão" lines={[[`Trechos de fonte indexados`, chunks ? Object.values(chunks).reduce((a, b) => a + b, 0) : "banco indisponível"]]} note="O livro básico não foi ingerido: o projeto não tem cópia autorizada." />
        <SummaryCard title="Verificação" lines={Object.entries(summary.verification).map(([k, v]) => [VERIFICATION_LABELS[k as keyof typeof VERIFICATION_LABELS], v])} />
        <SummaryCard title="Implementação" lines={Object.entries(summary.implementation).map(([k, v]) => [IMPLEMENTATION_LABELS[k as keyof typeof IMPLEMENTATION_LABELS], v])} />
        <SummaryCard
          title="Testes"
          lines={Object.entries(summary.tests).map(([k, v]) => [TEST_LABELS[k as TestCoverageStatus], v])}
          note={report ? `Relatório de ${report.mtime.toLocaleString("pt-BR")}` : "Rode pnpm test:report para gerar o relatório."}
        />
      </div>
      <Card className="mb-10 border-gold/30 p-4 text-sm">
        <span className="font-semibold text-gold">Confirmadas: {summary.confirmed}</span>
        <span className="text-ash"> de {summary.total} — regras implementadas, com testes passando e verificadas contra fonte autorizada. Enquanto o proprietário não conferir o livro, este número é zero por definição.</span>
      </Card>

      <section className="mb-10">
        <h2 className="font-display mb-3 text-2xl">Buscar regra</h2>
        <RuleSearch />
      </section>

      {evals && (
        <section className="mb-10">
          <h2 className="font-display mb-3 text-2xl">Avaliações do mestre</h2>
          <p className="mb-3 text-xs text-dim">Gerado em {new Date(evals.data.generatedAt).toLocaleString("pt-BR")} por pnpm evals.</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {evals.data.metrics.map((m) => (
              <Card key={m.id} className="flex items-center justify-between p-3 text-sm">
                <span className="text-ash">{m.label}</span>
                <span className="flex items-center gap-2 font-mono">
                  {m.unit === "%" ? `${(m.value * 100).toFixed(1)}%` : m.value}
                  <Badge tone={m.passed ? "green" : "red"}>{m.passed ? "ok" : "abaixo da meta"}</Badge>
                </span>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="mb-10">
        <h2 className="font-display mb-3 text-2xl">Relatório de fontes</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {SOURCES.map((s) => (
            <Card key={s.id} className="p-4 text-sm">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-medium">{s.title}</span>
                <Badge tone={s.accessStatus === "accessible" ? "green" : "gold"}>{ACCESS_LABELS[s.accessStatus]}</Badge>
              </div>
              <p className="text-xs text-dim">
                {s.publisher} · {s.version}
              </p>
              <p className="mt-2 text-ash">{s.notes}</p>
              <p className="mt-2 text-xs text-dim">
                Trechos indexados: {chunks?.[s.id] ?? 0}
                {s.url && (
                  <>
                    {" · "}
                    <a href={s.url} className="underline underline-offset-2 hover:text-ash" target="_blank" rel="noreferrer">
                      página oficial
                    </a>
                  </>
                )}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display mb-3 text-2xl">Catálogo de regras ({ALL_RULES.length})</h2>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[800px] text-left text-xs">
            <thead className="bg-raised text-ash">
              <tr>
                <th className="p-2">Regra</th>
                <th className="p-2">Fonte</th>
                <th className="p-2">Verificação</th>
                <th className="p-2">Implementação</th>
                <th className="p-2">Testes</th>
              </tr>
            </thead>
            <tbody>
              {coverage.map(({ rule, testStatus, matchedTests }) => (
                <tr key={rule.id} className="border-t border-line align-top">
                  <td className="p-2">
                    <p className="font-medium text-bone">{rule.title}</p>
                    <p className="font-mono text-[10px] text-dim">{rule.id}</p>
                    <p className="mt-1 max-w-md text-ash">{rule.summary}</p>
                    {rule.limitations && <p className="mt-1 max-w-md text-dim">Limitação: {rule.limitations}</p>}
                    {rule.conflictNotes && <p className="mt-1 max-w-md text-gold">Conflito: {rule.conflictNotes}</p>}
                  </td>
                  <td className="p-2 text-ash">
                    {sourceTitle(rule.sourceId)}
                    <br />
                    <span className="text-dim">{rule.sourceLocator}</span>
                  </td>
                  <td className="p-2">
                    <Badge tone={rule.verificationStatus === "conflict" ? "red" : rule.verificationStatus.endsWith("verified") ? "green" : "neutral"}>{VERIFICATION_LABELS[rule.verificationStatus]}</Badge>
                  </td>
                  <td className="p-2">
                    <Badge tone={rule.implementationStatus === "implemented" ? "green" : rule.implementationStatus === "partial" ? "gold" : "neutral"}>{IMPLEMENTATION_LABELS[rule.implementationStatus]}</Badge>
                  </td>
                  <td className="p-2">
                    <Badge tone={testStatus === "passing" ? "green" : testStatus === "failing" ? "red" : "neutral"}>{TEST_LABELS[testStatus]}</Badge>
                    {matchedTests.length > 0 && <p className="mt-1 text-[10px] text-dim">{matchedTests.length} teste(s)</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ title, lines, note }: { title: string; lines: [string, number | string][]; note?: string }) {
  return (
    <Card className="p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-blood">{title}</h3>
      <dl className="space-y-1 text-sm">
        {lines.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <dt className="text-ash">{k}</dt>
            <dd className="font-mono">{v}</dd>
          </div>
        ))}
      </dl>
      {note && <p className="mt-2 text-[11px] text-dim">{note}</p>}
    </Card>
  );
}
