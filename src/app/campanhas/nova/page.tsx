import { NewCampaignForm } from "@/components/campaign/new-campaign-form";
import { PageHeader } from "@/components/ui";
import { RULES_SYSTEMS } from "@/modules/rules/registry";

export default function NewCampaignPage() {
  const systems = RULES_SYSTEMS.map((s) => ({ id: s.id, name: s.name, availability: s.availability, editions: s.editions }));
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PageHeader eyebrow="Novo arquivo" title="Nova campanha" />
      <NewCampaignForm systems={systems} />
    </div>
  );
}
