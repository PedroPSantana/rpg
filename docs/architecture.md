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

1. O cliente envia `POST /api/campaigns/:id/actions` com uma **chave de idempotência**, a versão do estado que está vendo e uma ação estruturada (clique) **ou** texto livre.
2. Se a chave já existe, o servidor devolve o resultado gravado (status `duplicate`) sem rodar nada de novo. O cliente reenvia com a mesma chave em falhas de rede.
3. Texto livre passa pelo `GmOrchestrator.interpret`. A resposta da IA é validada com Zod; respostas malformadas são repetidas uma vez e depois substituídas pelo intérprete offline. Perguntas de regra são respondidas **somente** a partir do catálogo, com citação e status de verificação. Sem resultado no catálogo, o mestre diz que não sabe.
4. A ação candidata vai para `resolveAction`, que é **puro e determinístico** dada uma fonte de aleatoriedade. Em produção os dados vêm de `node:crypto` no servidor; nos testes, de geradores com semente. Ações inválidas (objeto inexistente, DT fora da tabela, caminho bloqueado, ação proibida em combate) são rejeitadas com o id da regra.
5. O resultado é gravado numa transação com **controle otimista de versão** (`version` da campanha). Duas abas agindo ao mesmo tempo não corrompem o estado: uma delas recebe 409.
6. Só depois a narração é gerada a partir dos fatos gravados. Se falhar, a ação continua aplicada e o cliente pode pedir a narração de novo (`/actions/:id/narrate`), que nunca reexecuta a mecânica. Movimentos simples são narrados offline para não gastar chamadas de IA.

## Mundo 3D

Mapas são grades definidas por modelos ASCII (`world/templates.ts`) e montadas pelo gerador. Objetos têm máquinas de estado (`world/schema.ts`): portas fechadas/abertas/trancadas/arrombadas, contêineres, pistas, NPCs, criatura e artefato. Só eventos do contrato `MapEvent` mudam o mapa e cada evento é validado antes de ser aplicado. A cena (React Three Fiber) apenas desenha o estado recebido do servidor e anima o caminho; ela nunca decide colisão ou resultado.

O cliente recebe uma **visão do jogador** (`toClientView`): objetos ocultos ainda não revelados, salas secretas, segredos de NPCs, desfechos e estatísticas da criatura são removidos antes de sair do servidor.

## Persistência

PostgreSQL via Prisma 7 (adaptador `pg`). Tabelas principais: `Campaign` (blueprint, impressão digital de novidade, estado e versão), `Character`, `ActionLog` (idempotência e sequência), `RollLog`, `NarrativeEntry`, `CampaignMemory`, `RuleSource`, `RuleRecord` e `SourceChunk`. A busca em texto completo usa `tsvector` em português com `unaccent` e índices GIN.

## Controle de acesso

Esta versão é para uso local ou de um grupo pequeno. A identidade é um cookie anônimo `rpg_player` criado em `src/proxy.ts`, e **todas** as consultas filtram por esse dono. Isso isola campanhas entre navegadores, mas **não é autenticação**: quem copiar o cookie age como o dono. Antes de expor o servidor na internet, coloque um login real (por exemplo Auth.js) e troque `currentPlayer()` para ler a sessão autenticada. O resto do código já recebe o `playerId` como parâmetro.

## Extensão para outros sistemas

Cada sistema registra um `RulesSystemDescriptor` em `rules/registry.ts` (edições, fontes, aviso de licença). A UI e o serviço consultam o descritor; Tormenta20 e D&D já aparecem como "em breve". Para adicionar um sistema: criar `rules/systems/<id>` com dados, validação de ficha e resolução de testes, um catálogo em `knowledge/catalog`, e adaptar o motor de campanha onde ele chama funções específicas de Ordem Paranormal (ficha, testes de perícia e combate). Esse acoplamento está concentrado em `campaign/engine.ts` e `campaign/encounter.ts`.
