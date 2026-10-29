import { MapDefinitionSchema, type MapDefinition, type MapObject } from "./schema";
import { templateSlots, templateTiles, type MapTemplate } from "./templates";

export type SlotBinding = Omit<MapObject, "id" | "position" | "facing" | "hidden"> & { id?: string; hidden?: boolean };

/**
 * Builds a validated map definition from a template and content bound to its
 * slots. Unbound slots become plain floor; doors are always created.
 */
export function buildMap(template: MapTemplate, opts: { id: string; name?: string; bindings: Record<string, SlotBinding>; exitTo: { mapId: string; spawn: string } | null; exitName?: string }): MapDefinition {
  const { slots, spawns } = templateSlots(template);
  const objects: MapObject[] = [];
  for (const slot of slots) {
    if (slot.letter === "d") {
      const cfg = template.doors?.[slot.id] ?? {};
      objects.push({
        id: `${opts.id}.${slot.id}`,
        kind: "door",
        name: cfg.name ?? "Porta",
        description: cfg.hidden ? "Uma passagem disfarçada." : "Uma porta de madeira gasta.",
        position: slot.position,
        facing: 0,
        model: cfg.hidden ? "secret-door" : "door",
        initialState: cfg.state ?? "closed",
        hidden: !!cfg.hidden,
        verbs: ["open", "close", "unlock", "force", "inspect"],
      });
      continue;
    }
    if (slot.letter === "x") {
      objects.push({
        id: `${opts.id}.${slot.id}`,
        kind: "exit",
        name: opts.exitName ?? (template.kind === "exterior" ? "Entrada" : "Saída"),
        description: template.kind === "exterior" ? "A entrada do local investigado." : "Leva de volta para fora.",
        position: slot.position,
        facing: 0,
        model: "door",
        initialState: "closed",
        hidden: false,
        verbs: ["open", "close", "unlock", "force", "enter", "inspect"],
        leadsTo: opts.exitTo ?? undefined,
      });
      continue;
    }
    const binding = opts.bindings[slot.id];
    if (!binding) continue;
    objects.push({ ...binding, id: binding.id ?? `${opts.id}.${slot.id}`, position: slot.position, facing: 0, hidden: binding.hidden ?? false });
  }
  return MapDefinitionSchema.parse({
    id: opts.id,
    name: opts.name ?? template.name,
    kind: template.kind,
    width: template.rows[0].length,
    height: template.rows.length,
    tiles: templateTiles(template),
    ambience: template.ambience,
    spawns,
    areas: template.areas,
    objects,
  });
}
