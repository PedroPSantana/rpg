import type { ThreatDef } from "../schema";

export interface Vars {
  city: string;
  place: string;
  placeKind: "casarao" | "escola";
  victim: string;
  witness: string;
  caretaker: string;
  insider: string;
}

interface ObjectText {
  name: string;
  description: string;
  model: string;
}

interface ClueText {
  title: string;
  description: string;
  object: ObjectText;
  failure: string;
}

export interface Role {
  role: string;
  gender: "f" | "m";
  personality: string;
  motivation: string;
  secret: string;
  voice: string;
  deflection: string;
}

export interface Archetype {
  victimGender: "f" | "m";
  id: string;
  element: ThreatDef["element"];
  title: (v: Vars) => string;
  premise: (v: Vars) => string;
  hook: (v: Vars) => string;
  antagonist: (v: Vars) => { name: string; nature: string; motive: string };
  threat: Omit<ThreatDef, "id" | "provenance" | "weakness"> & { weakness: { description: string } };
  clues: {
    trace: (v: Vars) => ClueText;
    testimony: (v: Vars) => Omit<ClueText, "object" | "failure">;
    document: (v: Vars) => ClueText;
    passage: (v: Vars) => ClueText;
    ritual: (v: Vars) => ClueText;
  };
  insider: {
    survivor: (v: Vars) => Role;
    culprit: (v: Vars) => Role;
  };
  witness: (v: Vars) => Role;
  caretaker: (v: Vars) => Role;
  artifact: (v: Vars) => ObjectText;
  decision: (v: Vars) => {
    prompt: string;
    destroy: { label: string; description: string };
    seal: { label: string; description: string };
    take: { label: string; description: string };
  };
  endings: (v: Vars) => {
    destroyed: string;
    destroyedLate: string;
    sealed: string;
    taken: string;
    fled: string;
    defeat: string;
  };
  urgency: (v: Vars) => { half: string; full: string };
}
