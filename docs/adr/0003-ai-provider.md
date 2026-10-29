# ADR 0003 — Camada de IA independente de provedor

**Status:** aceito (2026-10-29)

**Decisão.** Interface `GmProvider` com dois métodos (`interpret`, `narrate`) que podem devolver qualquer coisa; o `GmOrchestrator` aplica tempo limite, nova tentativa, validação e fallback. Implementações: `OfflineGmProvider` (determinístico, pt-BR) e `AnthropicGmProvider` (SDK oficial, saída estruturada com Zod, modelo padrão `claude-opus-5-5`, fallback de modelo no servidor quando a resposta é recusada). A chave só existe no servidor.

**Consequências.** Trocar ou adicionar provedores não toca no motor. O modo offline mantém testes, avaliações e o jogo funcionando sem chave.
