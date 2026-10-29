import { findPath, isPresent } from "./grid";
import { STATE_MACHINES, type MapDefinition, type MapEvent, type MapState } from "./schema";

export type WorldMaps = Record<string, MapState>;
export type MapRegistry = Record<string, MapDefinition>;

export type EventCheck = { ok: true } | { ok: false; reason: string };

/**
 * Validates a map event against definitions and current state. Nothing —
 * including AI proposals — may change the world without passing here.
 */
export function validateMapEvent(defs: MapRegistry, maps: WorldMaps, currentMapId: string, event: MapEvent): EventCheck {
  const mapId = event.type === "transition" ? event.fromMapId : event.mapId;
  const def = defs[mapId];
  const state = maps[mapId];
  if (!def || !state) return { ok: false, reason: `Mapa inexistente: ${mapId}` };

  switch (event.type) {
    case "set_object_state": {
      const obj = def.objects.find((o) => o.id === event.objectId);
      if (!obj) return { ok: false, reason: `Objeto inexistente: ${event.objectId}` };
      const current = state.objects[obj.id]?.state ?? obj.initialState;
      if (current === event.state) return { ok: false, reason: `${obj.name} já está em "${current}".` };
      const allowed = STATE_MACHINES[obj.kind][current] ?? [];
      if (!allowed.includes(event.state)) return { ok: false, reason: `Transição ilegal para ${obj.name}: ${current} → ${event.state}` };
      return { ok: true };
    }
    case "reveal_object": {
      const obj = def.objects.find((o) => o.id === event.objectId);
      if (!obj) return { ok: false, reason: `Objeto inexistente: ${event.objectId}` };
      if (!obj.hidden) return { ok: false, reason: `${obj.name} não é um objeto oculto.` };
      if (state.objects[obj.id]?.revealed) return { ok: false, reason: `${obj.name} já foi revelado.` };
      return { ok: true };
    }
    case "reveal_area": {
      const area = def.areas.find((a) => a.id === event.areaId);
      if (!area) return { ok: false, reason: `Área inexistente: ${event.areaId}` };
      if (!area.hidden || state.revealedAreas.includes(area.id)) return { ok: false, reason: `Área ${area.name} já está visível.` };
      return { ok: true };
    }
    case "move_player": {
      if (mapId !== currentMapId) return { ok: false, reason: "O personagem não está neste mapa." };
      const path = findPath(def, state, state.player, event.to);
      if (!path) return { ok: false, reason: "Destino bloqueado ou inalcançável." };
      return { ok: true };
    }
    case "transition": {
      if (mapId !== currentMapId) return { ok: false, reason: "O personagem não está neste mapa." };
      const target = defs[event.toMapId];
      if (!target || !maps[event.toMapId]) return { ok: false, reason: `Mapa de destino inexistente: ${event.toMapId}` };
      if (!target.spawns[event.spawn]) return { ok: false, reason: `Ponto de chegada inexistente: ${event.spawn}` };
      const exit = def.objects.find((o) => o.kind === "exit" && o.leadsTo?.mapId === event.toMapId && isPresent(def, state, o.id));
      if (!exit) return { ok: false, reason: "Não há passagem para esse local." };
      const exitState = state.objects[exit.id]?.state ?? exit.initialState;
      if (exitState !== "open" && exitState !== "broken") return { ok: false, reason: `${exit.name} está fechada.` };
      return { ok: true };
    }
  }
}

/** Applies a *validated* event. Pure: returns new map states. */
export function applyMapEvent(defs: MapRegistry, maps: WorldMaps, event: MapEvent): { maps: WorldMaps; currentMapId?: string } {
  const next: WorldMaps = structuredClone(maps);
  switch (event.type) {
    case "set_object_state": {
      const s = next[event.mapId];
      const obj = defs[event.mapId].objects.find((o) => o.id === event.objectId)!;
      s.objects[event.objectId] = { revealed: s.objects[event.objectId]?.revealed ?? !obj.hidden, state: event.state };
      return { maps: next };
    }
    case "reveal_object": {
      const s = next[event.mapId];
      const obj = defs[event.mapId].objects.find((o) => o.id === event.objectId)!;
      s.objects[event.objectId] = { state: s.objects[event.objectId]?.state ?? obj.initialState, revealed: true };
      return { maps: next };
    }
    case "reveal_area":
      next[event.mapId].revealedAreas.push(event.areaId);
      return { maps: next };
    case "move_player":
      next[event.mapId].player = event.to;
      return { maps: next };
    case "transition": {
      const target = next[event.toMapId];
      target.player = defs[event.toMapId].spawns[event.spawn];
      target.visited = true;
      return { maps: next, currentMapId: event.toMapId };
    }
  }
}

export function initialMapState(def: MapDefinition, spawn = "start"): MapState {
  return {
    mapId: def.id,
    objects: Object.fromEntries(def.objects.map((o) => [o.id, { state: o.initialState, revealed: !o.hidden }])),
    revealedAreas: def.areas.filter((a) => !a.hidden).map((a) => a.id),
    player: def.spawns[spawn] ?? Object.values(def.spawns)[0],
    visited: false,
  };
}
