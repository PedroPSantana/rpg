# Suíte de avaliação do mestre

`pnpm evals` roda offline e de forma determinística (sementes fixas) e grava `reports/evals.json` e `reports/evals.md`. O comando falha se alguma métrica ficar abaixo da meta. O painel `/conhecimento` mostra o último resultado.

| Grupo | O que mede |
|---|---|
| Recuperação | 28 perguntas em pt-BR → regra esperada no 1º e nos 3 primeiros resultados |
| Sem invenção | Perguntas fora do catálogo precisam receber "não encontrei" |
| Interpretação | Frases de exploração, conversa e combate → ação estruturada correta (intérprete offline) |
| Validação | Ações inválidas da IA rejeitadas; respostas malformadas substituídas; fichas inválidas rejeitadas com a regra citada |
| Cálculo | Valores derivados da ficha e distribuição dos testes de d20 (maior/menor de 2d20) |
| Novidade | Arquétipos distintos e similaridade máxima entre campanhas seguidas |
| Equilíbrio (Monte Carlo) | Jogador automático (`evals/lib/autoplayer.ts`) em 600 sessões, dois estilos (cauteloso e imprudente) e dois agentes (Combatente e Especialista): taxa de desfecho, de derrota, ações e pistas |
| Consistência | Invariantes do estado, reexecução idêntica com a mesma semente, desfecho coerente com o estado final |

## Limitações conhecidas

- O conjunto de interpretação é pequeno e foi ajustado depois de ver as primeiras falhas, então 100% ali mede regressão, não generalização. Frases novas devem entrar no conjunto antes de qualquer ajuste no intérprete.
- A avaliação não chama a IA real (custo e não determinismo). Ela garante que **qualquer** resposta da IA passa pela mesma validação; a qualidade da narração com IA ainda precisa de avaliação humana.
- O jogador automático é simples. As taxas de derrota descrevem esse jogador, não pessoas. Um Especialista que enfrenta a criatura de frente morre na maioria das vezes (cerca de 60%); com jogo cauteloso, cerca de um terço.
