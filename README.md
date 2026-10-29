# Mestre das Sombras — RPG com Mestre IA

Plataforma web para jogar campanhas de horror investigativo com um mestre de IA. O primeiro sistema suportado é **Ordem Paranormal RPG** (somente o Livro de Regras básico). A arquitetura já prevê Tormenta20 e D&D.

Princípios do projeto:

- **A IA narra; o software decide.** Regras, dados, dano, estado do mundo e desfechos são resolvidos por código determinístico e testado. A IA só interpreta o texto do jogador e narra fatos já resolvidos.
- **A cena 2.5D reage à campanha.** Cada cômodo tem visual próprio; portas, pistas, NPCs e a criatura mudam de estado por eventos validados e persistidos.
- **Campanhas isoladas, persistentes e originais.** Cada campanha gera um mistério original a partir de uma semente, com checagem de novidade.
- **Honestidade sobre as regras.** Nada do livro é reproduzido. Cada regra tem status separados de verificação, implementação e testes (veja `/conhecimento`).

> Obra não oficial e gratuita sob a Licença Comunitária de Ordem Paranormal. Contém material gerado por inteligência artificial. Veja [docs/rules/source-report.md](docs/rules/source-report.md).

## Requisitos

- Node.js 22+ e pnpm 10 (`corepack enable`)
- PostgreSQL 14+ com a extensão `unaccent` disponível (vem no pacote `postgresql-contrib`)

## Jogar sem instalar nada (GitHub Codespaces)

1. Na página do repositório, clique em **Code → Codespaces → Create codespace on main**.
2. Espere a preparação (instala dependências, cria o banco e o catálogo de regras).
3. O jogo é compilado e iniciado no terminal; clique em **Open in Browser** no aviso da porta 3000.

A configuração fica em `.devcontainer/` e também funciona com a extensão Dev Containers do VS Code.

## Rodando localmente

```bash
pnpm install                      # também gera o cliente Prisma
cp .env.example .env              # ajuste DATABASE_URL / TEST_DATABASE_URL
createdb rpg && createdb rpg_test # ou crie os bancos pelo seu cliente
pnpm db:migrate                   # aplica as migrações no banco principal
pnpm db:seed                      # sincroniza o catálogo de regras e indexa os procedimentos originais
pnpm dev                          # http://localhost:3000
```

Sem chave de API o jogo funciona com o **mestre offline** (determinístico, em pt-BR). Para usar a IA, configure no `.env`:

```bash
GM_PROVIDER="anthropic"
ANTHROPIC_API_KEY="sua-chave"   # nunca é enviada ao navegador
ANTHROPIC_MODEL="claude-opus-5-5"
```

O provedor Anthropic usa saída estruturada validada por Zod e o fallback de modelo do lado do servidor quando uma resposta é recusada. Se a IA falhar ou demorar, o mestre offline assume sem perder a ação.

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js em desenvolvimento / build de produção / servidor de produção |
| `pnpm typecheck` | TypeScript sem emitir arquivos |
| `pnpm lint` | ESLint |
| `pnpm db:test:prepare` | Aplica as migrações no banco de testes (`TEST_DATABASE_URL`) |
| `pnpm test` | Testes unitários e de integração (Vitest; a integração usa `rpg_test`) |
| `pnpm test:report` | Testes + relatório JSON em `reports/vitest.json` (alimenta a cobertura em `/conhecimento`) |
| `pnpm evals` | Suíte de avaliação do mestre; gera `reports/evals.json` e `reports/evals.md` |
| `pnpm db:seed` | Sincroniza fontes/regras e indexa `docs/rules/original-procedures.md` |
| `pnpm tsx scripts/ingest.ts <fonte> <arquivo>` | Indexa um texto que você tem direito de usar (fica só no seu banco) |

## Como jogar

1. **Campanhas → Nova campanha**: escolha o sistema e a edição (Tormenta20 e D&D aparecem como "em breve").
2. **Criar agente**: o assistente mostra só opções implementadas e valida cada escolha com a mesma função usada pelo servidor.
3. **Jogar**: escreva o que seu agente faz ou diz ("pergunto à zeladora se ela tem a chave", "vou para a biblioteca", "examino a gaveta com cuidado"). Clique nas pessoas e objetos da cena para falar com eles ou agir sobre eles, e nas portas para mudar de cômodo. A planta no canto da cena também leva a cômodos conhecidos.
4. Quando a ação tem risco real, o mestre explica o que está em jogo e mostra os dados, modificadores e a DT. **Você rola clicando em Rolar**; o servidor rola e a animação para no resultado real. Conversar, olhar e andar não pedem teste.
5. O diário separa o que você sabe (fatos confirmados), o que disseram (depoimentos), hipóteses e objetivos; a aba Pistas mostra as pistas e as pessoas que você conheceu; a aba Dados mostra cada rolagem; a aba Combate aparece quando a criatura ataca.
6. Toda ação é salva. Feche o navegador e continue depois do mesmo ponto. Campanhas podem ser renomeadas, arquivadas e excluídas no hub.

## Estrutura

```
src/
  app/                 páginas (pt-BR) e rotas de API
  components/          UI: hub, criador, jogo, cena 2.5D em SVG (components/scene), conhecimento
  modules/
    rules/             motor de regras (núcleo de dados + sistema Ordem Paranormal)
    knowledge/         catálogo de regras, fontes, busca, ingestão, cobertura
    world/             mapas em grade, colisão, portas, eventos de mapa
    adventures/        gerador de aventuras originais e checagem de novidade
    campaign/          motor de campanha determinístico (ações → resultado)
    gm/                orquestração do mestre (Anthropic + offline)
  server/              serviço de campanhas (Prisma), identidade, HTTP
prisma/                schema, migrações e seed
evals/                 suíte de avaliação e jogador automático (Monte Carlo)
tests/                 integração (banco real) e avaliação rápida
docs/                  arquitetura, ADRs, relatório de fontes, procedimentos originais
```

Mais detalhes em [docs/architecture.md](docs/architecture.md).
