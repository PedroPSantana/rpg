import type { RulesSystemDescriptor } from "../../core/system";
import { EDITION_ID, SYSTEM_ID } from "./data";

export const opDescriptor: RulesSystemDescriptor = {
  id: SYSTEM_ID,
  name: "Ordem Paranormal RPG",
  availability: "available",
  editions: [
    {
      id: EDITION_ID,
      name: "Livro de Regras básico (Jambô)",
      description:
        "Regras do livro básico, sem suplementos. As regras implementadas estão marcadas como não verificadas até conferência com o livro do proprietário.",
      sourceIds: ["op-core-rulebook"],
      confirmedBy: { who: "Santana (proprietário do projeto)", date: "2026-10-29" },
      available: true,
    },
  ],
  licenseNotice:
    "Conteúdo não oficial, criado sob a Licença Comunitária de Ordem Paranormal. Contém material gerado por inteligência artificial. Ordem Paranormal é criação de Rafael Lange (Cellbit); este projeto não é endossado pelos detentores dos direitos.",
};
