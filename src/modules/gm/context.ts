import type { AdventureBlueprint } from "@/modules/adventures/schema";
import type { CampaignState } from "@/modules/campaign/state";
import { findRules } from "@/modules/knowledge";
import type { OpCharacterState, OpSheet } from "@/modules/rules/systems/ordem-paranormal/character";
import { isPresent } from "@/modules/world/grid";

export interface GmContextInput {
  blueprint: AdventureBlueprint;
  state: CampaignState;
  sheet: OpSheet;
  character: OpCharacterState & { name: string; concept: string };
  history: { role: "GM" | "PLAYER" | "SYSTEM"; content: string }[];
  memories: string[];
}

/** Stable system prompt (cache-friendly: no per-request data). */
export const GM_SYSTEM_PROMPT = `Você é a Mestra de uma campanha solo de horror investigativo usando as regras de Ordem Paranormal RPG (livro básico).
Regras invioláveis:
- Você NÃO resolve mecânicas. Dados, testes, dano, recursos, pistas, portas, combate e finais são decididos pelo motor de regras do servidor. Nunca invente rolagens, bônus, itens, pistas ou resultados.
- Na interpretação, traduza a intenção do jogador para UMA ação estruturada usando apenas ids que aparecem no contexto. Se nada servir, use "narrative" (ação descritiva) ou "clarify" com uma pergunta curta.
- Testes improvisados (intent "skill_check") só para tarefas sem conteúdo definido, com DT da tabela oficial: 5, 10, 15, 20, 25, 30 ou 40. Eles não mudam o mundo.
- Na narração, descreva os FATOS fornecidos com atmosfera, em português do Brasil, segunda pessoa, 2 a 5 frases. Nunca contradiga um fato. Nunca revele informações marcadas como segredo da Mestra antes de serem descobertas.
- Dê voz própria a cada NPC segundo personalidade, motivação e voz. NPCs só revelam o que os fatos dizem que revelaram.
- Teorias não são evidências: só trate algo como confirmado se estiver nos fatos.
- Respeite a agência do jogador; sugestões são opcionais.
- Todo o conteúdo é original e não oficial.`;

export function describeContext(input: GmContextInput, playerText?: string) {
  const { blueprint: bp, state, sheet, character } = input;
  const map = bp.maps.find((m) => m.id === state.currentMapId)!;
  const ms = state.maps[map.id];
  const objects = map.objects
    .filter((o) => isPresent(map, ms, o.id))
    .map((o) => {
      const dist = Math.max(Math.abs(o.position.x - ms.player.x), Math.abs(o.position.y - ms.player.y));
      return `- ${o.id} | ${o.kind} | ${o.name} | estado: ${ms.objects[o.id]?.state ?? o.initialState} | distância: ${dist} | ações: ${o.verbs.join(",")}`;
    })
    .join("\n");
  const npcs = bp.npcs
    .filter((n) => n.mapId === map.id)
    .map((n) => {
      const s = state.npcs[n.id];
      return `- ${n.id}: ${n.name}, ${n.role}. Personalidade: ${n.personality} Motivação: ${n.motivation} Voz: ${n.voice} Disposição: ${s.disposition}. Coopera: ${s.cooperative ? "sim" : "não"}. [SEGREDO DA MESTRA: ${n.secret}${n.isCulprit ? " — é cúmplice da ameaça" : ""}]`;
    })
    .join("\n");
  const clues = bp.clues.map((c) => `- ${c.title}: ${state.clues[c.id].discovered ? `DESCOBERTA — ${c.description}` : "não descoberta [conteúdo oculto]"}`).join("\n");
  const quests = bp.quests
    .map((q) => `- ${q.title} (${state.quests[q.id].status}): ${q.objectives.map((o) => `${state.quests[q.id].objectives[o.id] ? "[x]" : "[ ]"} ${o.text}`).join("; ")}`)
    .join("\n");
  const rules = playerText ? findRules(playerText, { editionId: bp.editionId }, 3).map((h) => `- ${h.rule.title}: ${h.rule.summary} (${h.citation}; verificação: ${h.rule.verificationStatus})`).join("\n") : "";
  const enc = state.encounter;
  const threat = enc ? bp.threats.find((t) => t.id === enc.threatId) : null;
  const decisionOpen = state.mode !== "ended" && state.encountersResolved[bp.encounters[0]?.id] === "victory" && !(bp.decision.id in state.decisions);

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

# Situação
Modo: ${state.mode}. Local: ${map.name} (${map.id}). Urgência: ${state.urgency}/${bp.urgency.max}.
${enc && threat ? `COMBATE contra ${threat.name}: PV ${enc.threat.pv}/${enc.threat.pvMax}, rodada ${enc.round}. Ações válidas: attack (weaponId), flee (skillId atletismo|acrobacia), first_aid.` : ""}
${decisionOpen ? `DECISÃO DISPONÍVEL (${bp.decision.prompt}) opções: ${bp.decision.options.map((o) => `${o.id} = ${o.label}`).join("; ")}` : ""}
Objetos visíveis:
${objects}
NPCs neste local:
${npcs || "- nenhum"}

# Pistas
${clues}

# Missões
${quests}

# Memória da campanha (não autoritativa)
${input.memories.slice(-8).map((m) => `- ${m}`).join("\n") || "- nenhuma"}

# Últimos acontecimentos
${input.history.slice(-10).map((h) => `${h.role === "PLAYER" ? "Jogador" : h.role === "GM" ? "Mestra" : "Sistema"}: ${h.content}`).join("\n") || "(início da campanha)"}
${rules ? `\n# Regras relevantes (catálogo do projeto)\n${rules}` : ""}`;
}
