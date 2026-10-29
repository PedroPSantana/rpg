/**
 * op-core.equipment.* — the starting-equipment subset used by the first
 * adventure. Statistics are *unverified* until checked against the owner's
 * book; see the knowledge catalog. Only items listed here can be chosen.
 */
export type ItemCategory = 0 | 1 | 2 | 3 | 4;

export interface WeaponDef {
  kind: "weapon";
  id: string;
  name: string;
  proficiency: "simples" | "taticas" | "pesadas";
  range: "corpo-a-corpo" | "curto" | "medio";
  /** Firearms use Pontaria and benefit from Para Bellum. */
  firearm: boolean;
  /** Melee (and thrown) weapons add FOR to damage. */
  addsStrength: boolean;
  damage: string;
  critThreshold: number;
  critMultiplier: number;
  damageType: "corte" | "impacto" | "perfuracao" | "balistico";
  category: ItemCategory;
  spaces: number;
}

export interface ProtectionDef {
  kind: "protection";
  id: string;
  name: string;
  proficiency: "protecao-leve" | "protecao-pesada";
  defense: number;
  category: ItemCategory;
  spaces: number;
}

export interface GearDef {
  kind: "gear";
  id: string;
  name: string;
  description: string;
  /** Skill this kit enables/assists. */
  skill?: string;
  category: ItemCategory;
  spaces: number;
  consumable?: { effect: "heal"; amount: string; uses: number };
}

export type ItemDef = WeaponDef | ProtectionDef | GearDef;

export const ITEMS: ItemDef[] = [
  { kind: "weapon", id: "faca", name: "Faca", proficiency: "simples", range: "corpo-a-corpo", firearm: false, addsStrength: true, damage: "1d4", critThreshold: 19, critMultiplier: 2, damageType: "corte", category: 0, spaces: 1 },
  { kind: "weapon", id: "martelo", name: "Martelo", proficiency: "simples", range: "corpo-a-corpo", firearm: false, addsStrength: true, damage: "1d6", critThreshold: 20, critMultiplier: 2, damageType: "impacto", category: 0, spaces: 1 },
  { kind: "weapon", id: "bastao", name: "Bastão", proficiency: "simples", range: "corpo-a-corpo", firearm: false, addsStrength: true, damage: "1d6", critThreshold: 20, critMultiplier: 2, damageType: "impacto", category: 0, spaces: 1 },
  { kind: "weapon", id: "machete", name: "Machete", proficiency: "taticas", range: "corpo-a-corpo", firearm: false, addsStrength: true, damage: "1d6", critThreshold: 19, critMultiplier: 2, damageType: "corte", category: 0, spaces: 1 },
  { kind: "weapon", id: "pistola", name: "Pistola", proficiency: "simples", range: "curto", firearm: true, addsStrength: false, damage: "1d12", critThreshold: 18, critMultiplier: 2, damageType: "balistico", category: 1, spaces: 1 },
  { kind: "weapon", id: "revolver", name: "Revólver", proficiency: "simples", range: "curto", firearm: true, addsStrength: false, damage: "2d6", critThreshold: 19, critMultiplier: 3, damageType: "balistico", category: 1, spaces: 1 },
  { kind: "weapon", id: "espingarda", name: "Espingarda", proficiency: "taticas", range: "curto", firearm: true, addsStrength: false, damage: "4d6", critThreshold: 20, critMultiplier: 3, damageType: "balistico", category: 1, spaces: 2 },
  { kind: "protection", id: "protecao-leve", name: "Proteção leve", proficiency: "protecao-leve", defense: 5, category: 1, spaces: 2 },
  { kind: "gear", id: "kit-medicina", name: "Kit de perícia (Medicina)", description: "Ataduras e remédios para primeiros socorros.", skill: "medicina", category: 0, spaces: 1 },
  { kind: "gear", id: "kit-investigacao", name: "Kit de perícia (Investigação)", description: "Luvas, lupa, sacos de evidência e pó revelador.", skill: "investigacao", category: 0, spaces: 1 },
  { kind: "gear", id: "lanterna", name: "Lanterna tática", description: "Ilumina o caminho em locais escuros.", category: 0, spaces: 1 },
  { kind: "gear", id: "celular", name: "Celular", description: "Câmera, lanterna fraca e acesso à internet onde houver sinal.", category: 0, spaces: 0 },
];

export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

export function itemCategoryKey(category: ItemCategory): "I" | "II" | "III" | "IV" | null {
  return category === 0 ? null : (["I", "II", "III", "IV"] as const)[category - 1];
}

/** op-core.equipment.load — 5 spaces per FOR point (2 when FOR is 0). */
export function loadCapacity(strength: number): number {
  return strength <= 0 ? 2 : strength * 5;
}
