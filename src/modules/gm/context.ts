import type { AdventureBlueprint } from "@/modules/adventures/schema";
import type { CampaignState } from "@/modules/campaign/state";
import { findRules } from "@/modules/knowledge";
import type { OpCharacterState, OpSheet } from "@/modules/rules/systems/ordem-paranormal/character";
import { areaAt, areaOpenings, objectsInArea } from "@/modules/world/areas";
import { isPresent } from "@/modules/world/grid";

export interface GmContextInput {
  blueprint: AdventureBlueprint;
  state: CampaignState;
  sheet: OpSheet;
  character: OpCharacterState & { name: string; concept: string };
  /** Recent exchanges, oldest first. */
  history: { role: "GM" | "PLAYER" | "SYSTEM"; content: string }[];
  /** Object the player clicked before writing, if any. */
  targetId?: string | null;
}

/** Stable system prompt (cache-friendly: no per-request data). */
export const GM_SYSTEM_PROMPT = `Você é a Mestra de uma campanha solo de horror investigativo com as regras de Ordem Paranormal RPG (livro básico). Escreva sempre em português do Brasil natural, na segunda pessoa.

Divisão de responsabilidades (inviolável):
- O motor de regras do servidor decide tudo o que é mecânico: testes, DT, bônus, dano, recursos, portas, pistas, itens, combate, objetivos e finais. Você interpreta a intenção do jogador e narra resultados já resolvidos. Nunca invente estatísticas, modificadores, rolagens ou desfechos.
- O estado da campanha só muda pelo motor. O que você escreve em prosa não cria fatos: se algo não está em "Fatos estabelecidos" ou nos FATOS da ação, não aconteceu.
- Hipóteses não são fatos. Nunca revele o que está marcado como [SEGREDO DA MESTRA] ou pistas não descobertas sem que os fatos da ação digam que foram descobertas.

Ao INTERPRETAR:
- Leia a intenção por trás da linguagem comum. O jogador pode tentar qualquer coisa; não existe lista de ações permitidas.
- Distinga conversa, perguntas, observação, investigação cuidadosa, persuasão, enganação, intimidação, furtividade, movimento, interação física, ataques e poderes.
- Conversa e ações simples sem incerteza real não pedem teste: perguntar algo a alguém é "talk" com abordagem "conversar"; olhar ao redor ou para algo é "observe"; ir a outro cômodo é "go".
- Use "interact" com verbo "search"/"inspect" só para exame cuidadoso de um objeto (o motor decide se há teste).
- Persuadir, intimidar, enganar ou ler alguém são abordagens de "talk"; o motor só pede teste se a pessoa resistir.
- "skill_check" é exceção: só quando há chance real de falha, consequência que importa e nenhum conteúdo do contexto cobre a tentativa. Escolha a DT pela tabela oficial (5, 10, 15, 20, 25, 30, 40) e explique em "stakes" o que está em jogo.
- Use apenas ids que aparecem no contexto. Se o jogador se refere a alguém ou algo que não está ali, ou a intenção é ambígua, use "clarify" com uma pergunta curta e natural.

Ao NARRAR:
- Responda diretamente ao que o jogador tentou e descreva as consequências. Não repita a ação do jogador ("Você examina...", "Você entra...", "Você se move...").
- Narre só os FATOS fornecidos. Se houve teste, a narração precisa concordar com o resultado: falha é falha, sucesso é sucesso. Informe o resultado em "outcome".
- Não repita frases, imagens ou informações já narradas nas últimas mensagens, a não ser que seja necessário.
- Clima, chuva, vento, cheiros, sons e escuridão só quando acrescentam algo à cena. Nada de atmosfera genérica.
- Seja breve em ações simples (1 a 3 frases). Expanda em descobertas importantes, confrontos e momentos dramáticos.
- Não ofereça dicas, listas de soluções ou o que o jogador deveria fazer a seguir. Revele informação apenas pela narração.
- Dê voz própria a cada NPC (personalidade, motivação, jeito de falar). NPCs só revelam o que os fatos dizem que revelaram.
- Tom de Ordem Paranormal: investigação, suspense, horror sobrenatural e consequências reais. Todo o conteúdo é original e não oficial.`;

function list(lines: string[], empty = "- nenhum") {
  return lines.length ? lines.join("\n") : empty;
}

export function describeContext(input: GmContextInput, playerText?: string) {
  const { blueprint: bp, state, sheet, character } = input;
  const map = bp.maps.find((m) => m.id === state.currentMapId)!;
  const ms = state.maps[map.id];
  const here = areaAt(map, ms.player);
  const areaObjects = here ? objectsInArea(map, ms, here.id) : [];
  const nearbyIds = new Set(areaObjects.map((o) => o.id));
  const objLine = (o: (typeof map.objects)[number]) => {
    const st = ms.objects[o.id]?.state ?? o.initialState;
    return `- ${o.id} | ${o.kind} | ${o.name} | estado: ${st} | ações: ${o.verbs.join(",")}`;
  };
  const objects = map.objects.filter((o) => isPresent(map, ms, o.id) && o.kind !== "door" && o.kind !== "exit");
  const openings = here
    ? areaOpenings(map, ms, here.id).map((op) => {
        const st = ms.objects[op.object.id]?.state ?? op.object.initialState;
        const to = op.toAreaId ? map.areas.find((a) => a.id === op.toAreaId)?.name : op.object.kind === "exit" ? "saída do local" : "?";
        return `- ${op.object.id} | ${op.object.name} → ${to} | estado: ${st}`;
      })
    : [];
  const areas = map.areas.filter((a) => !a.hidden || ms.revealedAreas.includes(a.id)).map((a) => `${a.id} (${a.name})`);
  const npcs = bp.npcs
    .filter((n) => n.mapId === map.id && state.npcs[n.id].state !== "gone")
    .map((n) => {
      const s = state.npcs[n.id];
      const told = bp.clues.filter((c) => state.clues[c.id].discoveredBy === n.name).map((c) => c.title);
      return `- ${n.id}: ${n.name}, ${n.role}${nearbyIds.has(n.objectId) ? " (neste cômodo)" : ""}. Personalidade: ${n.personality} Motivação: ${n.motivation} Voz: ${n.voice} Disposição: ${s.disposition}. Já conversou: ${s.talked ? "sim" : "não"}. Coopera: ${s.cooperative ? "sim" : "não"}. Já contou: ${told.join("; ") || "nada"}. [SEGREDO DA MESTRA: ${n.secret}${n.isCulprit ? " — é cúmplice da ameaça" : ""}]`;
    });
  const facts = state.journal.filter((j) => j.kind === "fact").map((j) => `- ${j.text}${j.source ? ` (fonte: ${j.source})` : ""}`);
  const statements = state.journal.filter((j) => j.kind === "statement").map((j) => `- ${j.text}`);
  const events = state.journal.filter((j) => j.kind === "event").slice(-12).map((j) => `- ${j.text}`);
  const hypotheses = bp.hypotheses.map((h) => {
    const supported = h.supportedBy.length > 0 && h.supportedBy.every((id) => state.clues[id].discovered);
    return `- ${h.text} (${supported ? "apoiada pelas pistas, ainda não confirmada" : "não confirmada"})`;
  });
  const quests = bp.quests.flatMap((q) => {
    const qs = state.quests[q.id];
    return [
      `- ${q.title} [${qs.status === "active" ? "ativa" : qs.status === "completed" ? "concluída" : "falhou"}]`,
      ...q.objectives.map((o) => `  ${qs.objectives[o.id] ? "[x]" : "[ ]"} ${o.text}`),
    ];
  });
  const undiscovered = bp.clues.filter((c) => !state.clues[c.id].discovered).length;
  const rules = playerText
    ? findRules(playerText, { editionId: bp.editionId }, 3)
        .map((h) => `- ${h.rule.title}: ${h.rule.summary} (${h.citation}; verificação: ${h.rule.verificationStatus})`)
        .join("\n")
    : "";
  const enc = state.encounter;
  const threat = enc ? bp.threats.find((t) => t.id === enc.threatId) : null;
  const decisionOpen = state.mode !== "ended" && state.encountersResolved[bp.encounters[0]?.id] === "victory" && !(bp.decision.id in state.decisions);
  const target = input.targetId ? map.objects.find((o) => o.id === input.targetId) : null;
  const history = input.history.slice(-8).map((h) => `${h.role === "PLAYER" ? "Jogador" : h.role === "GM" ? "Mestra" : "Sistema"}: ${h.content}`);

  return `# Campanha: ${bp.title}
Cenário: ${bp.setting.city}, ${bp.setting.place}. ${bp.setting.time}.
Premissa: ${bp.premise}
Antagonista [SEGREDO DA MESTRA]: ${bp.antagonist.name} — ${bp.antagonist.nature} Motivo: ${bp.antagonist.motive}

# Personagem
${character.name} (${sheet.className}, ${sheet.originName}, NEX ${sheet.nex}%). ${character.concept}
PV ${character.pv}/${sheet.pvMax} · PE ${character.pe}/${sheet.peMax} · SAN ${character.san}/${sheet.sanMax} · Defesa ${sheet.defense}
Perícias treinadas: ${sheet.skills.filter((s) => s.grade !== "untrained").map((s) => `${s.id} (+${s.bonus})`).join(", ")}
Poderes: ${sheet.abilities.map((a) => `${a.id} (${a.summary})`).join(" | ")}
Ataques: ${sheet.attacks.map((a) => `${a.weaponId}: ${a.name} ${a.damage}+${a.damageBonus}`).join("; ")}
Inventário: ${character.inventory.map((i) => `${i.itemId} (${i.name})`).join(", ") || "vazio"}

# Local e estado do mundo
Modo: ${state.mode}. Local: ${map.name} (${map.id}). Cômodo atual: ${here ? `${here.name} (${here.id})` : "?"}. Urgência: ${state.urgency}/${bp.urgency.max}.
Cômodos conhecidos deste local: ${areas.join(", ")}
Passagens a partir daqui:
${list(openings)}
Objetos neste cômodo:
${list(areaObjects.filter((o) => o.kind !== "threat").map(objLine))}
Outros objetos do local (fora deste cômodo):
${list(objects.filter((o) => !nearbyIds.has(o.id) && o.kind !== "threat").map(objLine))}
${target ? `ALVO SELECIONADO PELO JOGADOR: ${target.id} (${target.name}). Se a fala não indicar outro alvo, ela se refere a este.` : ""}
${enc && threat ? `COMBATE contra ${threat.name}: PV ${enc.threat.pv}/${enc.threat.pvMax}, rodada ${enc.round}. Ações válidas: attack (weaponId), flee (skillId atletismo|acrobacia), first_aid.` : ""}
${decisionOpen ? `DECISÃO PENDENTE (${bp.decision.prompt}) opções: ${bp.decision.options.map((o) => `${o.id} = ${o.label}`).join("; ")}` : ""}

# Pessoas deste local
${list(npcs)}

# Fatos estabelecidos (verdade da campanha)
${list(facts, "- nenhum ainda")}

# O que os NPCs disseram
${list(statements, "- nada ainda")}

# Acontecimentos
${list(events, "- nenhum ainda")}

# Hipóteses (NÃO são fatos)
${list(hypotheses)}

# Objetivos
${list(quests)}
Pistas ainda não descobertas: ${undiscovered} [conteúdo é SEGREDO DA MESTRA]

# Conversa recente (não repita o que já foi narrado)
${list(history, "(início da campanha)")}
${rules ? `\n# Regras relevantes (catálogo do projeto)\n${rules}` : ""}`;
}
