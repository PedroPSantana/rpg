import { describe, expect, it } from "vitest";
import { buildMap } from "../build";
import { applyMapEvent, initialMapState, validateMapEvent } from "../events";
import { findPath, isWalkable } from "../grid";
import { TEMPLATES, templateSlots } from "../templates";

describe("map templates", () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))("%s is rectangular, enclosed and has spawns", (_, t) => {
    const w = t.rows[0].length;
    expect(t.rows.every((r) => r.length === w)).toBe(true);
    expect(t.rows[0]).toMatch(/^[#X]+$/);
    expect(t.rows.at(-1)).toMatch(/^[#X]+$/);
    const { spawns, slots } = templateSlots(t);
    expect(Object.keys(spawns).sort()).toEqual(["exit", "start"].filter((k) => t.kind === "exterior" || k === "exit"));
    expect(slots.some((s) => s.letter === "x")).toBe(true);
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))("%s: every slot is reachable once doors are open", (_, t) => {
    const def = buildMap(t, { id: "m", bindings: {}, exitTo: null });
    const state = initialMapState(def, def.kind === "exterior" ? "start" : "exit");
    for (const o of def.objects) state.objects[o.id] = { state: "open", revealed: true };
    const { slots } = templateSlots(t);
    for (const s of slots.filter((x) => x.letter !== "x" && x.letter !== "d")) {
      const neighbours = [
        { x: s.position.x + 1, y: s.position.y },
        { x: s.position.x - 1, y: s.position.y },
        { x: s.position.x, y: s.position.y + 1 },
        { x: s.position.x, y: s.position.y - 1 },
      ];
      expect(neighbours.some((n) => findPath(def, state, state.player, n)), `${t.id} ${s.id}`).toBeTruthy();
    }
  });
});

describe("map events", () => {
  const t = TEMPLATES.find((x) => x.id === "int-casarao")!;
  const def = buildMap(t, {
    id: "casa",
    bindings: { c1: { kind: "clue", name: "Diário", description: "Um diário.", model: "book", initialState: "untouched", verbs: ["inspect", "search"] } },
    exitTo: { mapId: "rua", spawn: "exit" },
  });
  const ext = buildMap(TEMPLATES[0], { id: "rua", bindings: {}, exitTo: { mapId: "casa", spawn: "exit" } });
  const defs = { casa: def, rua: ext };
  const maps = { casa: initialMapState(def, "exit"), rua: initialMapState(ext) };

  it("rejects unknown objects and illegal transitions", () => {
    expect(validateMapEvent(defs, maps, "casa", { type: "set_object_state", mapId: "casa", objectId: "nope", state: "open" })).toMatchObject({ ok: false });
    // locked door cannot become "searched"
    expect(validateMapEvent(defs, maps, "casa", { type: "set_object_state", mapId: "casa", objectId: "casa.d2", state: "searched" }).ok).toBe(false);
    expect(validateMapEvent(defs, maps, "casa", { type: "set_object_state", mapId: "casa", objectId: "casa.d2", state: "open" }).ok).toBe(true);
    expect(validateMapEvent(defs, maps, "casa", { type: "set_object_state", mapId: "casa", objectId: "casa.c1", state: "found" }).ok).toBe(true);
  });

  it("rejects movement into walls, closed doors and unreachable tiles", () => {
    expect(validateMapEvent(defs, maps, "casa", { type: "move_player", mapId: "casa", to: { x: 0, y: 0 } }).ok).toBe(false);
    // Kitchen is behind a closed door
    expect(validateMapEvent(defs, maps, "casa", { type: "move_player", mapId: "casa", to: { x: 2, y: 12 } }).ok).toBe(false);
    expect(validateMapEvent(defs, maps, "casa", { type: "move_player", mapId: "casa", to: { x: 15, y: 12 } }).ok).toBe(true);
  });

  it("opening a door makes the room reachable and persists in state", () => {
    const step = applyMapEvent(defs, maps, { type: "set_object_state", mapId: "casa", objectId: "casa.d8", state: "open" });
    expect(step.maps.casa.objects["casa.d8"].state).toBe("open");
    expect(maps.casa.objects["casa.d8"].state).toBe("closed"); // pure
    expect(isWalkable(def, step.maps.casa, { x: 8, y: 12 })).toBe(true);
  });

  it("hidden objects can be revealed only once and only if hidden", () => {
    expect(validateMapEvent(defs, maps, "casa", { type: "reveal_object", mapId: "casa", objectId: "casa.d5" }).ok).toBe(true);
    expect(validateMapEvent(defs, maps, "casa", { type: "reveal_object", mapId: "casa", objectId: "casa.d1" }).ok).toBe(false);
  });

  it("transition requires an open exit to that map and a valid spawn", () => {
    expect(validateMapEvent(defs, maps, "casa", { type: "transition", fromMapId: "casa", toMapId: "rua", spawn: "exit" })).toMatchObject({ ok: false, reason: expect.stringContaining("fechada") });
    const exitId = def.objects.find((o) => o.kind === "exit")!.id;
    const opened = applyMapEvent(defs, maps, { type: "set_object_state", mapId: "casa", objectId: exitId, state: "open" }).maps;
    expect(validateMapEvent(defs, opened, "casa", { type: "transition", fromMapId: "casa", toMapId: "rua", spawn: "nowhere" }).ok).toBe(false);
    expect(validateMapEvent(defs, opened, "casa", { type: "transition", fromMapId: "casa", toMapId: "rua", spawn: "exit" }).ok).toBe(true);
    const moved = applyMapEvent(defs, opened, { type: "transition", fromMapId: "casa", toMapId: "rua", spawn: "exit" });
    expect(moved.currentMapId).toBe("rua");
    expect(moved.maps.rua.player).toEqual(ext.spawns.exit);
  });
});
