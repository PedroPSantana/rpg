# ADR 0004 — Catálogo de regras com status independentes

**Status:** aceito (2026-10-29)

**Contexto.** O projeto não tem acesso autorizado ao livro e não pode reproduzir texto protegido, mas precisa implementar regras e responder perguntas sobre elas.

**Decisão.** Cada regra é um registro com resumo parafraseado, fonte e localizador, e quatro estados separados: ingestão, verificação, implementação e testes (ligados a nomes de testes reais e ao relatório do Vitest). O mestre responde regras apenas a partir do catálogo, com citação e status, e diz que não sabe quando a busca não cobre a pergunta.

**Consequências.** O painel `/conhecimento` mostra exatamente o que está confirmado. Regras não verificadas funcionam no jogo, mas são exibidas como tal até o proprietário conferir no livro.
