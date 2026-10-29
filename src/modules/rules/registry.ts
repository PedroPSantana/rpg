import type { RulesSystemDescriptor } from "./core/system";
import { opDescriptor } from "./systems/ordem-paranormal/descriptor";

/** Every rules system known to the platform. New systems register here. */
export const RULES_SYSTEMS: RulesSystemDescriptor[] = [
  opDescriptor,
  {
    id: "tormenta20",
    name: "Tormenta20",
    availability: "planned",
    editions: [],
    licenseNotice: "",
  },
  {
    id: "dnd5e",
    name: "Dungeons & Dragons",
    availability: "planned",
    editions: [],
    licenseNotice: "",
  },
];

export function getSystem(id: string) {
  return RULES_SYSTEMS.find((s) => s.id === id);
}

export function getEdition(systemId: string, editionId: string) {
  return getSystem(systemId)?.editions.find((e) => e.id === editionId);
}
