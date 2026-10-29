# Arquitetura

Monólito modular em Next.js (App Router). Cada módulo em `src/modules` é TypeScript puro, sem acesso a banco ou rede, e por isso testável isoladamente. Só `src/server` fala com o PostgreSQL e só `src/modules/gm/anthropic.ts` fala com a IA.

```
navegador ──HTTP──▶ rotas /api (src/app/api) ──▶ serviço de campanhas (src/server/campaigns.ts)
                                                   │
             ┌─────────────────────────────────────┼───────────────────────────────┐
             ▼                                     ▼                               ▼
   GmOrchestrator (gm)                 resolveAction (campaign)           Prisma / PostgreSQL
   interpreta texto → ação             regras (rules) + mundo (world)     estado versionado,
   narra fatos já resolvidos           + aventura (adventures)            logs de ação e rolagem
```

## Fluxo de uma ação

1. O cliente envia `POST /api/campaigns/:id/actions` com uma **chave de idempotência**, a versão do estado que está vendo e uma ação estruturada (clique) **ou** texto livre (com o objeto clicado em `targetId`, se houver).
2. Se a chave já existe, o servidor devolve o resultado gravado (`duplicate`). A mesma frase enviada de novo em até 20 s também é tratada como a mesma ação (duplo clique, Enter + botão). Enquanto houver uma rolagem pendente, outras ações recebem 409.
3. Texto livre passa pelo `GmOrchestrator.interpret`. A IA classifica a fala (conversa, pergunta, observação, investigação, abordagem social, furtividade, movimento, ação física, ataque) e escolhe uma intenção: `observe`, `go`, `interact`, `talk`, `skill_check`, `decide`, `attack`, `flee`, `first_aid` ou `clarify`. Olhar, conversar e andar não pedem teste; testes improvisados exigem DT da tabela oficial e um texto de **stakes** (o que está em jogo). Respostas malformadas são repetidas uma vez e depois substituídas pelo intérprete offline. Intenção ambígua vira uma pergunta de volta, sem mudar nada.
4. A ação vai para `runAction` (`campaign/engine.ts`), que é **puro**. Toda rolagem do personagem (testes, ataque, dano, iniciativa, cura) é uma *rolagem do jogador*:
   - no modo manual, o motor para na primeira rolagem do jogador e devolve um `RollRequest` (dados, modificadores, DT ou Defesa, custo em PE e stakes). O servidor grava uma ação `PENDING` com a **fita de dados** e nada no mundo muda;
   - quando o jogador clica em **Rolar** (`POST /actions/:id/roll` com o índice da rolagem), o servidor rola exatamente aquela rolagem e repete a ação desde o início com a fita gravada. Como o motor é puro, a repetição chega ao mesmo ponto e continua. Rolagens do mundo (ataques da criatura, dano mental) ficam numa fita separada e nunca são roladas de novo;
   - um clique duplo com o mesmo índice devolve o mesmo resultado; antes do primeiro dado é possível desistir (`/actions/:id/cancel`).
5. O resultado é gravado numa transação com **controle otimista de versão**. O motor também escreve o **diário estruturado** (`state.journal`): fatos confirmados, depoimentos de NPCs (que não são fatos) e acontecimentos. Prosa nunca muda o estado.
6. Só depois a narração é gerada. O narrador recebe *beats* tipados (narração, diálogo, descoberta, chegada, perigo) e o veredito do motor. A guarda (`gm/guard.ts`) rejeita narração que contradiz o veredito ou revela pista não descoberta, segredo de NPC ou o nome do antagonista, e remove frases repetidas (dentro do texto e em relação às últimas narrações) e frases que só repetem a ação do jogador. Se a narração for rejeitada, há nova tentativa e depois o narrador offline. Se tudo falhar, a ação continua aplicada e pode ser narrada de novo (`/actions/:id/narrate`).

## Cena 2.5D

Mapas são grades (`world/templates.ts`) divididas em cômodos (`areas`). A cena (`components/scene`) é SVG puro, sem imagens externas: cada cômodo é desenhado em perspectiva de um ponto (`projection.ts`), com paredes, piso e teto texturizados por filtros, iluminação da lanterna no ponto onde o agente está, névoa, poeira, vinheta e paralaxe pelo ponteiro. Corredores longos são vistos no comprimento. O visual de cada cômodo vem de `decor.tsx` (escola: sala de aula com quadro-negro, diretoria, laboratório, pátio, biblioteca, almoxarifado; casarão: corredor, biblioteca, capela, quarto, cozinha, sala). A rua e o sítio mostram a fachada do lugar.

Objetos são desenhados por modelo (`sprites.tsx`) e ordenados por profundidade. NPCs ganham retrato procedural pelo nome e papel (`portrait.tsx`), o mesmo na cena e no diário. A criatura é só uma sombra até o encontro. Portas mostram o estado (fechada, trancada, aberta, arrombada); clicar numa porta para outro cômodo envia `go`. Clicar num objeto abre um painel com ações simples (olhar, examinar, abrir, pegar…) e um campo de texto livre ligado ao objeto. A cena nunca decide resultado: só desenha o estado recebido do servidor.

O cliente recebe uma **visão do jogador** (`toClientView`): objetos ocultos, salas secretas, segredos de NPCs, desfechos, a fita de dados pendente e dados da criatura ainda não encontrada são removidos antes de sair do servidor.

## Limitações conhecidas

- O intérprete **offline** é baseado em palavras-chave. Ele cobre os casos comuns (perguntar, observar, ir a um cômodo, examinar, convencer, ameaçar), mas entendimento real de linguagem livre depende do provedor de IA (`ANTHROPIC_API_KEY`). Sem chave, frases fora do padrão viram pergunta de volta.
- A narração offline é montada a partir dos fatos do motor; é correta, mas menos variada que a da IA.
- A cena desenha um cômodo por vez, sem mostrar o corpo do agente (a lanterna indica onde ele está).

## Persistência

PostgreSQL via Prisma 7 (adaptador `pg`). Tabelas principais: `Campaign` (blueprint, impressão digital de novidade, estado e versão), `Character`, `ActionLog` (idempotência, sequência e ações `PENDING` aguardando o clique nos dados), `RollLog`, `NarrativeEntry`, `CampaignMemory` (legado, não é mais escrito), `RuleSource`, `RuleRecord` e `SourceChunk`. A busca em texto completo usa `tsvector` em português com `unaccent` e índices GIN.

## Controle de acesso

Esta versão é para uso local ou de um grupo pequeno. A identidade é um cookie anônimo `rpg_player` criado em `src/proxy.ts`, e **todas** as consultas filtram por esse dono. Isso isola campanhas entre navegadores, mas **não é autenticação**: quem copiar o cookie age como o dono. Antes de expor o servidor na internet, coloque um login real (por exemplo Auth.js) e troque `currentPlayer()` para ler a sessão autenticada. O resto do código já recebe o `playerId` como parâmetro.

## Extensão para outros sistemas

Cada sistema registra um `RulesSystemDescriptor` em `rules/registry.ts` (edições, fontes, aviso de licença). A UI e o serviço consultam o descritor; Tormenta20 e D&D já aparecem como "em breve". Para adicionar um sistema: criar `rules/systems/<id>` com dados, validação de ficha e resolução de testes, um catálogo em `knowledge/catalog`, e adaptar o motor de campanha onde ele chama funções específicas de Ordem Paranormal (ficha, testes de perícia e combate). Esse acoplamento está concentrado em `campaign/engine.ts` e `campaign/encounter.ts`.
