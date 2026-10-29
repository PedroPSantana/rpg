# Relatório de aquisição de fontes

Data da consulta: 2026-10-29. Edição escolhida pelo proprietário (Santana) em 2026-10-29: **somente o Livro de Regras básico de Ordem Paranormal RPG** (id `op-core`), sem suplementos.

## O que foi consultado

| Fonte | Situação | Uso no projeto |
|---|---|---|
| Ordem Paranormal RPG — Livro de Regras (Jambô Editora, 320 páginas) | Produto pago (PDF e físico). A página da editora não informa número de impressão ou revisão. **O projeto não tem acesso ao texto.** | Nenhum trecho foi copiado ou ingerido. As regras do catálogo foram escritas como paráfrases curtas a partir de conhecimento prévio e marcadas **não verificadas**. |
| Página de erratas da Jambô | Acessível. Não há errata publicada para Ordem Paranormal RPG. | Registrado como fonte; nada a aplicar. |
| Licença Comunitária de Ordem Paranormal v1.0 (atualizada em 28/06/2026) | Acessível. | Define o que este projeto pode fazer (abaixo). |
| SRD / regras gratuitas | Não existe SRD oficial. | — |

PDFs não autorizados aparecem com frequência em buscas. Eles **não** foram baixados nem usados, e não devem ser.

## O que a licença permite e exige

- Obras **comerciais** não podem conter material gerado por IA. Este projeto usa IA, então deve permanecer **gratuito**.
- Obras gratuitas podem conter material gerado por IA desde que exibam o aviso "Contém material gerado por inteligência artificial". O aviso aparece no rodapé de todas as páginas.
- Não é permitido usar a marca ou o logotipo de Ordem Paranormal, nem nomes de personagens, organizações e locais canônicos, com exceção da Ordo Realitas. O app tem nome próprio e todo o conteúdo de aventura (cidades fictícias combinadas, NPCs, criaturas, artefatos) é original.
- Uso privado com até 10 pessoas dispensa a licença, mas o projeto segue as regras de obra gratuita de qualquer forma.

## Como verificar as regras

O proprietário tem (ou pode ter) o livro. Para promover uma regra de "não verificada" para "verificada pelo proprietário":

1. Abra `/conhecimento` e localize a regra pelo id (ex.: `op-core.combat.critical`).
2. Compare o resumo e o procedimento com o livro e preencha `sourceLocator` com capítulo e página em `src/modules/knowledge/catalog/op-core.ts`.
3. Mude `verificationStatus` para `owner_verified`. Se o livro disser outra coisa, corrija o código e os testes antes, nessa ordem.
4. Rode `pnpm test:report` e `pnpm db:seed`.

Se quiser busca em texto completo sobre suas próprias anotações do livro, use `pnpm tsx scripts/ingest.ts op-core-rulebook <arquivo>`. Os trechos ficam apenas no seu banco local e não vão para o repositório.

## Regras com ressalvas conhecidas

| Regra | Status | Ressalva |
|---|---|---|
| `op-core.progression.pe-limit` | conflito | A lembrança indica limite 1 PE por turno em NEX 5%, mas habilidades de NEX 5% custam 2 PE. O limite é exibido na ficha e **não** é aplicado até a conferência. |
| `op-core.character.skill-overlap` | incerta | Interpretação adotada: perícia repetida entre origem e classe vira uma escolha livre extra. |
| `op-core.equipment.weapons`, `op-core.equipment.load` | incerta | Estatísticas das armas e regra de carga precisam de conferência. |
| `op-core.combat.critical` | incerta | Crítico multiplica só os dados de dano. |
| `op-core.threat.presenca-perturbadora` | incerta | DT e dano mental definidos por criatura (as criaturas são originais). |
| `op-core.medicine.first-aid` | incerta | Cura de 1d8 com kit, uma vez por cena. |
| `op-core.class.ocultista` | não implementada | Rituais não implementados; a classe aparece bloqueada no criador. |

Origens cujo poder não está implementado aparecem bloqueadas no criador com a explicação. Hoje 10 de 26 origens estão liberadas.
