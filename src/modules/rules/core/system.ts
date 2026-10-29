/**
 * System-independent contracts. Every rules system (Ordem Paranormal today,
 * Tormenta20 / D&D later) registers a `RulesSystemDescriptor`; campaign,
 * GM and UI code talk to the descriptor and never import a system directly.
 */
export interface EditionDescriptor {
  id: string;
  name: string;
  /** Human-readable description shown in edition selection. */
  description: string;
  sourceIds: string[];
  /** Explicitly confirmed with the project owner, with date. */
  confirmedBy?: { who: string; date: string };
  available: boolean;
}

export interface RulesSystemDescriptor {
  id: string;
  name: string;
  /** Shown when the system cannot yet be selected. */
  availability: "available" | "planned";
  editions: EditionDescriptor[];
  /** Legal notice required by the rights holder's license, shown in-app. */
  licenseNotice: string;
}

/** Generic, system-agnostic view of a character for shared UI (hub cards, HUD). */
export interface CharacterSummary {
  name: string;
  concept: string;
  headline: string;
  resources: { id: string; label: string; current: number; max: number }[];
}
