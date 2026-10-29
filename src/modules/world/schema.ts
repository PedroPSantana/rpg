import { z } from "zod";

export const PositionSchema = z.object({ x: z.number().int(), y: z.number().int() });
export type Position = z.infer<typeof PositionSchema>;

export const VERBS = ["inspect", "search", "open", "close", "unlock", "force", "take", "use", "talk", "enter"] as const;
export type Verb = (typeof VERBS)[number];

export const OBJECT_KINDS = ["door", "container", "clue", "npc", "threat", "item", "exit", "prop", "artifact"] as const;

/** Legal state machine per object kind. Keys are states, values reachable states. */
export const STATE_MACHINES: Record<(typeof OBJECT_KINDS)[number], Record<string, string[]>> = {
  door: { closed: ["open", "locked"], open: ["closed"], locked: ["closed", "open", "broken"], broken: [] },
  exit: { closed: ["open", "locked"], open: ["closed"], locked: ["closed", "open", "broken"], broken: [] },
  container: { closed: ["open"], locked: ["open", "closed", "broken"], open: ["searched"], searched: [], broken: ["searched"] },
  clue: { untouched: ["searched", "found"], searched: ["found"], found: [] },
  npc: { idle: ["talking", "gone", "hostile", "dead"], talking: ["idle", "gone", "hostile"], gone: ["idle"], hostile: ["idle", "dead"], dead: [] },
  threat: { dormant: ["active", "defeated", "banished"], active: ["defeated", "banished", "fled"], fled: ["active"], defeated: [], banished: [] },
  item: { present: ["taken"], taken: [] },
  prop: { idle: ["disturbed"], disturbed: [] },
  artifact: { intact: ["destroyed", "sealed", "taken", "activated"], activated: ["destroyed", "sealed"], destroyed: [], sealed: [], taken: [] },
};

/** States in which an object blocks movement through its tile. */
export const BLOCKING_STATES: Partial<Record<(typeof OBJECT_KINDS)[number], string[]>> = {
  door: ["closed", "locked"],
  exit: ["closed", "locked"],
  npc: ["idle", "talking", "hostile"],
  threat: ["dormant", "active"],
  container: ["closed", "locked", "open", "searched", "broken"],
  artifact: ["intact", "activated", "sealed"],
};

export const MapObjectSchema = z.object({
  id: z.string(),
  kind: z.enum(OBJECT_KINDS),
  name: z.string(),
  /** Short, always-visible description. */
  description: z.string(),
  position: PositionSchema,
  /** Rotation in quarter turns, for rendering. */
  facing: z.number().int().min(0).max(3).default(0),
  model: z.string(),
  initialState: z.string(),
  hidden: z.boolean().default(false),
  verbs: z.array(z.enum(VERBS)),
  /** For exits: destination. */
  leadsTo: z.object({ mapId: z.string(), spawn: z.string() }).optional(),
});
export type MapObject = z.infer<typeof MapObjectSchema>;

export const AreaSchema = z.object({
  id: z.string(),
  name: z.string(),
  rect: z.object({ x: z.number().int(), y: z.number().int(), w: z.number().int(), h: z.number().int() }),
  hidden: z.boolean().default(false),
});

export const MapDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["exterior", "interior"]),
  width: z.number().int(),
  height: z.number().int(),
  /** Rows of tiles: '#' wall, '.' floor, ',' outdoor ground, 'o' obstacle, 'T' tree, 'D' door slot. */
  tiles: z.array(z.string()),
  ambience: z.object({ fog: z.string(), ambient: z.number(), sky: z.string(), flicker: z.boolean() }),
  spawns: z.record(z.string(), PositionSchema),
  areas: z.array(AreaSchema),
  objects: z.array(MapObjectSchema),
});
export type MapDefinition = z.infer<typeof MapDefinitionSchema>;

export const ObjectStateSchema = z.object({ state: z.string(), revealed: z.boolean() });

export const MapStateSchema = z.object({
  mapId: z.string(),
  objects: z.record(z.string(), ObjectStateSchema),
  revealedAreas: z.array(z.string()),
  player: PositionSchema,
  visited: z.boolean().default(false),
});
export type MapState = z.infer<typeof MapStateSchema>;

/** Contract between the campaign backend and the 3D scene. Only these events may change the map. */
export const MapEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_object_state"), mapId: z.string(), objectId: z.string(), state: z.string() }),
  z.object({ type: z.literal("reveal_object"), mapId: z.string(), objectId: z.string() }),
  z.object({ type: z.literal("reveal_area"), mapId: z.string(), areaId: z.string() }),
  z.object({ type: z.literal("move_player"), mapId: z.string(), to: PositionSchema }),
  z.object({ type: z.literal("transition"), fromMapId: z.string(), toMapId: z.string(), spawn: z.string() }),
]);
export type MapEvent = z.infer<typeof MapEventSchema>;
