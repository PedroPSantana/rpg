# ADR 0002 — Motor determinístico; a IA só interpreta e narra

**Status:** aceito (2026-10-29)

**Contexto.** Modelos de linguagem erram contas, inventam regras e são difíceis de testar. O jogo precisa ser justo e reproduzível.

**Decisão.** Toda mecânica roda em `resolveAction(ctx, action)`, uma função pura que recebe a fonte de aleatoriedade. A IA devolve uma interpretação estruturada (validada com Zod) que vira uma ação candidata, validada de novo pelo motor. A narração recebe só os fatos já gravados. Dados são rolados no servidor com `node:crypto`.

**Consequências.** Testes e avaliações usam sementes e reproduzem sessões inteiras. Uma IA indisponível degrada para o mestre offline sem perder a partida. O custo é que a IA não pode improvisar mecânicas novas; ações fora do modelo viram narração sem efeito mecânico ou um pedido de esclarecimento.
