/** Natural pt-BR rules questions and the catalog rule that should answer them. */
export const RETRIEVAL_CASES: { query: string; expected: string }[] = [
  { query: "como funciona um teste de perícia?", expected: "op-core.test.basic" },
  { query: "quantos dados eu rolo num teste?", expected: "op-core.test.basic" },
  { query: "quais são as dificuldades possíveis de um teste", expected: "op-core.test.difficulty-table" },
  { query: "qual a DT de uma tarefa difícil", expected: "op-core.test.difficulty-table" },
  { query: "como distribuo os pontos de atributo", expected: "op-core.character.attributes" },
  { query: "posso deixar um atributo em zero?", expected: "op-core.character.attributes" },
  { query: "o que acontece se origem e classe derem a mesma perícia", expected: "op-core.character.skill-overlap" },
  { query: "bônus de perícia treinada e veterana", expected: "op-core.skills.training-grades" },
  { query: "perícia que só pode ser usada treinada", expected: "op-core.skills.trained-only" },
  { query: "pontos de vida do combatente", expected: "op-core.class.combatente" },
  { query: "o que o especialista ganha", expected: "op-core.class.especialista" },
  { query: "por que não posso jogar de ocultista", expected: "op-core.class.ocultista" },
  { query: "como calcular a defesa", expected: "op-core.derived.defense" },
  { query: "limite de gasto de PE por turno", expected: "op-core.progression.pe-limit" },
  { query: "quantos itens um recruta pode levar", expected: "op-core.progression.patente" },
  { query: "usar arma sem proficiência", expected: "op-core.equipment.proficiency" },
  { query: "carga máxima de inventário", expected: "op-core.equipment.load" },
  { query: "quem age primeiro no combate", expected: "op-core.combat.initiative" },
  { query: "como funciona um ataque", expected: "op-core.combat.attack" },
  { query: "acerto crítico multiplica o dano", expected: "op-core.combat.critical" },
  { query: "o que acontece quando chego a zero pontos de vida", expected: "op-core.conditions.morrendo" },
  { query: "dano mental e sanidade", expected: "op-core.sanity.damage" },
  { query: "presença perturbadora da criatura", expected: "op-core.threat.presenca-perturbadora" },
  { query: "ataque especial do combatente", expected: "op-core.ability.ataque-especial" },
  { query: "usar perícia não treinada com eclético", expected: "op-core.ability.ecletico" },
  { query: "como curar com medicina", expected: "op-core.medicine.first-aid" },
  { query: "relógio de urgência da investigação", expected: "rpg.investigation.urgency-clock" },
  { query: "poder do acadêmico saber é poder", expected: "op-core.origin.academico" },
];

/** Questions whose answers are NOT in the catalog: the GM must not invent an official rule. */
export const OUT_OF_CATALOG: string[] = ["como conjurar um ritual de terceiro círculo", "regras de veículos e perseguição de carro", "quanto custa um lança-chamas"];
