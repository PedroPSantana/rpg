import type { OpCharacterBuild } from "../character";

/** A valid NEX 5% Combatente/Policial used across tests. */
export const combatentePolicial: OpCharacterBuild = {
  name: "Lia Moreira",
  concept: "Ex-policial que viu algo que não deveria.",
  nex: 5,
  attributes: { AGI: 2, FOR: 2, INT: 1, PRE: 1, VIG: 3 },
  originId: "policial",
  classId: "combatente",
  classSkillChoices: ["luta", "reflexos"],
  // 1 + INT(1) = 2 free picks
  freeSkills: ["atletismo", "intimidacao"],
  peritoSkills: [],
  equipment: ["revolver", "protecao-leve", "faca", "lanterna"],
};

/** A valid Especialista/Acadêmico with INT 3 and one attribute at 0. */
export const especialistaAcademico: OpCharacterBuild = {
  name: "Caio Brandão",
  concept: "Pesquisador de folclore urbano.",
  nex: 5,
  attributes: { AGI: 1, FOR: 0, INT: 3, PRE: 2, VIG: 3 },
  originId: "academico",
  classId: "especialista",
  classSkillChoices: [],
  // 7 + INT(3) = 10
  freeSkills: ["percepcao", "intuicao", "medicina", "ocultismo", "atualidades", "diplomacia", "furtividade", "vontade", "tecnologia", "reflexos"],
  peritoSkills: ["investigacao", "ocultismo"],
  equipment: ["pistola", "kit-medicina", "kit-investigacao", "celular"],
};
