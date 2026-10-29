"use client";

import { areaAt, areaKey } from "@/modules/world/areas";
import type { MapDefinition, MapState } from "@/modules/world/schema";

/** Floor plan of the current location. Rooms the agent has not entered stay unnamed. */
export function Minimap({ map, state, visited, onArea }: { map: MapDefinition; state: MapState; visited: string[]; onArea: (areaId: string) => void }) {
  const cell = 7;
  const here = areaAt(map, state.player);
  return (
    <svg viewBox={`0 0 ${map.width * cell} ${map.height * cell}`} className="w-full" role="img" aria-label={`Planta: ${map.name}`}>
      {map.tiles.map((row, y) =>
        [...row].map((ch, x) => (ch === "#" ? <rect key={`${x}.${y}`} x={x * cell} y={y * cell} width={cell} height={cell} fill="#2e2935" /> : null)),
      )}
      {map.areas.map((a) => {
        const seen = visited.includes(areaKey(map.id, a.id));
        const current = here?.id === a.id;
        return (
          <g key={a.id} className="cursor-pointer" onClick={() => onArea(a.id)}>
            <title>{seen ? a.name : "Cômodo não visitado"}</title>
            <rect x={a.rect.x * cell} y={a.rect.y * cell} width={a.rect.w * cell} height={a.rect.h * cell} fill={current ? "#3a2a22" : seen ? "#211d27" : "#16131a"} stroke={current ? "#d6a55a" : "#2e2935"} strokeWidth="1" className="transition hover:fill-[#2b2530]" />
            {seen && a.rect.w * cell > 34 && (
              <text x={(a.rect.x + a.rect.w / 2) * cell} y={(a.rect.y + a.rect.h / 2) * cell + 3} textAnchor="middle" fontSize="8" fill={current ? "#ece6da" : "#6f6a72"} pointerEvents="none">
                {a.name.length > 14 ? `${a.name.slice(0, 13)}…` : a.name}
              </text>
            )}
          </g>
        );
      })}
      {map.objects
        .filter((o) => o.kind === "door" || o.kind === "exit")
        .map((o) => {
          const st = state.objects[o.id]?.state ?? o.initialState;
          return <rect key={o.id} x={o.position.x * cell + 1} y={o.position.y * cell + 1} width={cell - 2} height={cell - 2} fill={st === "open" || st === "broken" ? "#6f6a72" : st === "locked" ? "#b3261e" : "#5a3d28"} pointerEvents="none" />;
        })}
      <circle cx={(state.player.x + 0.5) * cell} cy={(state.player.y + 0.5) * cell} r={cell * 0.4} fill="#ffd9a1" />
    </svg>
  );
}
