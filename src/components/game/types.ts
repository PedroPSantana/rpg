import type { ClientView } from "@/server/campaigns";

export type View = ClientView;
export type RollDetail = {
  label: string;
  kind: string;
  expression: string;
  dice: { sides: number; value: number; kept: boolean }[];
  modifiers: { source: string; value: number }[];
  total: number;
  target?: number;
  outcome: "success" | "failure" | "critical" | "none";
  notes: string[];
};

export const VERB_LABELS: Record<string, string> = {
  inspect: "Examinar",
  search: "Investigar",
  open: "Abrir",
  close: "Fechar",
  unlock: "Destrancar",
  force: "Arrombar",
  take: "Pegar",
  use: "Usar",
  talk: "Conversar",
  enter: "Atravessar",
};

export const APPROACHES = [
  { id: "conversar", label: "Conversar" },
  { id: "persuadir", label: "Persuadir (Diplomacia)" },
  { id: "intimidar", label: "Intimidar" },
  { id: "enganar", label: "Enganar" },
  { id: "intuir", label: "Ler intenções (Intuição)" },
] as const;

export const POWER_LABELS: Record<string, string> = {
  "saber-e-poder": "Saber é Poder (2 PE)",
  "110-porcento": "110% (2 PE)",
  "faro-para-pistas": "Faro para Pistas",
  eclético: "Eclético (2 PE)",
  perito: "Perito (2 PE)",
};

export const STATE_LABELS: Record<string, string> = {
  closed: "fechada",
  open: "aberta",
  locked: "trancada",
  broken: "arrombada",
  searched: "revistado",
  untouched: "intocado",
  found: "examinado",
  idle: "",
  talking: "conversando",
  hostile: "hostil",
  dead: "morto",
  dormant: "adormecida",
  active: "ativa",
  intact: "intacto",
  sealed: "selado",
  destroyed: "destruído",
  activated: "ativado",
  present: "",
  disturbed: "mexido",
};
