# ADR 0001 — Monólito modular em Next.js

**Status:** aceito (2026-10-29)

**Contexto.** O projeto precisa de UI rica (3D), API, persistência e IA, mantido por uma pessoa, com a primeira entrega jogável.

**Decisão.** Um único app Next.js (App Router) com módulos TypeScript puros em `src/modules` (regras, mundo, aventuras, campanha, conhecimento, mestre) e uma camada fina de servidor em `src/server`. PostgreSQL via Prisma. React Three Fiber para a cena.

**Consequências.** Um deploy, um repositório, tipos compartilhados entre cliente e servidor (o criador de personagem usa a mesma validação do servidor). Os módulos puros podem virar pacotes ou serviços depois, se precisar.
