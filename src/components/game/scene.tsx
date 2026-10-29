"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { findPath, WALKABLE_TILES } from "@/modules/world/grid";
import type { MapDefinition, MapObject, MapState, Position } from "@/modules/world/schema";

export interface SceneProps {
  map: MapDefinition;
  state: MapState;
  selectedId: string | null;
  effects: string[];
  effectNonce: number;
  onTile: (p: Position) => void;
  onObject: (o: MapObject) => void;
}

const ELEMENT_COLORS: Record<string, string> = {
  sangue: "#c0262d",
  morte: "#8c8c8c",
  conhecimento: "#d9b44a",
  energia: "#8f5cff",
  medo: "#e8e8e8",
};

export function GameScene(props: SceneProps) {
  const { map } = props;
  return (
    <Canvas shadows={false} dpr={[1, 1.75]} camera={{ fov: 45, near: 0.1, far: 120, position: [0, 12, 10] }} gl={{ antialias: true }}>
      <color attach="background" args={[map.kind === "exterior" ? map.ambience.sky : map.ambience.fog]} />
      <fog attach="fog" args={[map.ambience.fog, 9, map.kind === "exterior" ? 34 : 26]} />
      <World {...props} />
    </Canvas>
  );
}

function ambientLevel(map: MapDefinition) {
  return 0.25 + map.ambience.ambient * 3;
}

function World({ map, state, selectedId, effects, effectNonce, onTile, onObject }: SceneProps) {
  const player = usePlayerMotion(map, state);
  const lantern = useRef<THREE.PointLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const flickerUntil = useRef(0);
  const clock = useThree((s) => s.clock);

  useEffect(() => {
    if (effects.includes("lights_flicker")) flickerUntil.current = clock.elapsedTime + 2.2;
    // Re-run only when a new batch of effects arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectNonce]);

  useFrame(({ clock: c }) => {
    const t = c.elapsedTime;
    let k = 1;
    if (t < flickerUntil.current) k = Math.random() > 0.35 ? 0.25 + Math.random() * 0.5 : 1;
    else if (map.ambience.flicker) k = 0.9 + Math.sin(t * 7.3) * 0.03 + (Math.random() > 0.995 ? -0.5 : 0);
    if (lantern.current) {
      lantern.current.intensity = 22 * k;
      lantern.current.position.set(player.current.x, 1.6, player.current.z);
    }
    if (ambient.current) ambient.current.intensity = ambientLevel(map) * (t < flickerUntil.current ? k : 1);
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={ambientLevel(map)} color="#9aa3c7" />
      <hemisphereLight args={["#46557a", "#1a120c", map.kind === "exterior" ? 1.1 : 0.45]} />
      <directionalLight position={[map.width * 0.3, 14, -4]} intensity={map.kind === "exterior" ? 0.6 : 0.15} color="#a6b6ff" />
      <pointLight ref={lantern} distance={12} decay={1.4} intensity={22} color="#ffd9a1" />
      <CameraRig target={player} />
      <Tiles map={map} onTile={onTile} />
      {map.objects.map((o) => (
        <ObjectMesh key={o.id} map={map} obj={o} state={state.objects[o.id]?.state ?? o.initialState} selected={selectedId === o.id} onSelect={onObject} />
      ))}
      <PlayerMesh target={player} />
    </>
  );
}

/** Animates the player along the grid path between authoritative positions. */
function usePlayerMotion(map: MapDefinition, state: MapState) {
  const pos = useRef(new THREE.Vector3(state.player.x, 0, state.player.y));
  const queue = useRef<Position[]>([]);
  const last = useRef<{ mapId: string; p: Position }>({ mapId: map.id, p: state.player });

  useLayoutEffect(() => {
    const prev = last.current;
    const next = state.player;
    if (prev.mapId !== map.id) {
      pos.current.set(next.x, 0, next.y);
      queue.current = [];
    } else if (prev.p.x !== next.x || prev.p.y !== next.y) {
      const path = findPath(map, state, prev.p, next, { passClosedDoors: true });
      queue.current = path ? path.slice(1) : [next];
    }
    last.current = { mapId: map.id, p: next };
  }, [map, state]);

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05) * 5.5;
    let remaining = step;
    while (remaining > 0 && queue.current.length) {
      const target = new THREE.Vector3(queue.current[0].x, 0, queue.current[0].y);
      const d = pos.current.distanceTo(target);
      if (d <= remaining) {
        pos.current.copy(target);
        queue.current.shift();
        remaining -= d;
      } else {
        pos.current.add(target.sub(pos.current).normalize().multiplyScalar(remaining));
        remaining = 0;
      }
    }
  });
  return pos;
}

function CameraRig({ target }: { target: React.RefObject<THREE.Vector3> }) {
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const { camera } = useThree();
  const init = useRef(false);
  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    const desired = target.current;
    if (!init.current) {
      c.target.copy(desired);
      camera.position.set(desired.x, 9.5, desired.z + 7.5);
      init.current = true;
    }
    const delta = desired.clone().sub(c.target).multiplyScalar(0.12);
    c.target.add(delta);
    camera.position.add(delta);
    c.update();
  });
  return <OrbitControls ref={controls} enablePan={false} minDistance={5} maxDistance={20} minPolarAngle={0.35} maxPolarAngle={1.15} enableDamping />;
}

function Tiles({ map, onTile }: { map: MapDefinition; onTile: (p: Position) => void }) {
  const walls = useRef<THREE.InstancedMesh>(null);
  const floors = useRef<THREE.InstancedMesh>(null);
  const obstacles = useRef<THREE.InstancedMesh>(null);
  const trees = useRef<THREE.InstancedMesh>(null);
  const [hover, setHover] = useState<Position | null>(null);

  const cells = useMemo(() => {
    const out = { wall: [] as Position[], floor: [] as Position[], obstacle: [] as Position[], tree: [] as Position[] };
    map.tiles.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === "#") out.wall.push({ x, y });
        else {
          out.floor.push({ x, y });
          if (ch === "o") out.obstacle.push({ x, y });
          if (ch === "T") out.tree.push({ x, y });
        }
      }),
    );
    return out;
  }, [map]);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    const exterior = map.kind === "exterior";
    cells.wall.forEach((p, i) => {
      m.makeTranslation(p.x, exterior ? 0.6 : 1.25, p.y);
      m.scale(new THREE.Vector3(1, exterior ? 1.2 : 2.5, 1));
      walls.current?.setMatrixAt(i, m);
      walls.current?.setColorAt(i, color.set(exterior ? "#3a342e" : "#4a413b").offsetHSL(0, 0, ((p.x * 31 + p.y * 17) % 7) * 0.006));
    });
    cells.floor.forEach((p, i) => {
      m.makeTranslation(p.x, -0.05, p.y);
      floors.current?.setMatrixAt(i, m);
      const base = exterior ? "#2a3024" : "#3a2f26";
      floors.current?.setColorAt(i, color.set(base).offsetHSL(0, 0, (((p.x * 13 + p.y * 7) % 5) - 2) * 0.008));
    });
    cells.obstacle.forEach((p, i) => {
      m.makeTranslation(p.x, 0.45, p.y);
      obstacles.current?.setMatrixAt(i, m);
    });
    cells.tree.forEach((p, i) => {
      m.makeTranslation(p.x, 1.2, p.y);
      trees.current?.setMatrixAt(i, m);
    });
    for (const r of [walls, floors, obstacles, trees]) {
      if (!r.current) continue;
      r.current.instanceMatrix.needsUpdate = true;
      if (r.current.instanceColor) r.current.instanceColor.needsUpdate = true;
      r.current.computeBoundingSphere();
    }
  }, [cells, map.kind]);

  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const x = Math.round(e.point.x);
    const y = Math.round(e.point.z);
    const ch = map.tiles[y]?.[x];
    return ch && WALKABLE_TILES.has(ch) ? { x, y } : null;
  };

  return (
    <group>
      <instancedMesh
        ref={floors}
        args={[undefined, undefined, cells.floor.length]}
        onPointerMove={(e) => {
          e.stopPropagation();
          setHover(pick(e));
        }}
        onPointerOut={() => setHover(null)}
        onClick={(e) => {
          e.stopPropagation();
          const p = pick(e);
          if (p) onTile(p);
        }}
      >
        <boxGeometry args={[1, 0.1, 1]} />
        <meshStandardMaterial roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={walls} args={[undefined, undefined, cells.wall.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={obstacles} args={[undefined, undefined, Math.max(1, cells.obstacle.length)]} count={cells.obstacle.length}>
        <boxGeometry args={[0.8, 0.9, 0.8]} />
        <meshStandardMaterial color="#4a3a2c" roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={trees} args={[undefined, undefined, Math.max(1, cells.tree.length)]} count={cells.tree.length}>
        <coneGeometry args={[0.55, 2.4, 6]} />
        <meshStandardMaterial color="#17261a" roughness={1} />
      </instancedMesh>
      {hover && (
        <mesh position={[hover.x, 0.02, hover.y]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 0.42, 24]} />
          <meshBasicMaterial color="#d6a55a" transparent opacity={0.7} />
        </mesh>
      )}
    </group>
  );
}

function PlayerMesh({ target }: { target: React.RefObject<THREE.Vector3> }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => ref.current?.position.copy(target.current));
  return (
    <group ref={ref}>
      <mesh position={[0, 0.55, 0]}>
        <capsuleGeometry args={[0.22, 0.6, 4, 12]} />
        <meshStandardMaterial color="#c9c2b5" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.08, 0]}>
        <sphereGeometry args={[0.17, 16, 16]} />
        <meshStandardMaterial color="#e2d2bd" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.32, 0.4, 32]} />
        <meshBasicMaterial color="#ffd9a1" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

function doorAxis(map: MapDefinition, p: Position): "x" | "z" {
  const wall = (x: number, y: number) => map.tiles[y]?.[x] === "#";
  return wall(p.x - 1, p.y) || wall(p.x + 1, p.y) ? "x" : "z";
}

function ObjectMesh({ map, obj, state, selected, onSelect }: { map: MapDefinition; obj: MapObject; state: string; selected: boolean; onSelect: (o: MapObject) => void }) {
  const [hovered, setHovered] = useState(false);
  const group = useRef<THREE.Group>(null);
  const glow = useRef<THREE.Mesh>(null);
  const highlight = selected || hovered;

  useFrame(({ clock }) => {
    if (glow.current) {
      const s = 1 + Math.sin(clock.elapsedTime * 3 + obj.position.x) * 0.12;
      glow.current.scale.set(s, s, s);
    }
    if (group.current && obj.kind === "threat" && state === "active") group.current.rotation.y += 0.01;
  });

  const handlers = {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onSelect(obj);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHovered(true);
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      setHovered(false);
      document.body.style.cursor = "";
    },
  };

  if ((obj.kind === "item" && state === "taken") || (obj.kind === "npc" && state === "gone") || (obj.kind === "artifact" && state === "taken")) return null;
  if (obj.kind === "threat" && (state === "defeated" || state === "banished")) {
    return (
      <mesh position={[obj.position.x, 0.02, obj.position.y]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.45, 20]} />
        <meshStandardMaterial color="#0d0b0b" roughness={1} />
      </mesh>
    );
  }

  const ring = highlight && (
    <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.42, 0.5, 32]} />
      <meshBasicMaterial color={selected ? "#e0603a" : "#d6a55a"} transparent opacity={0.9} />
    </mesh>
  );
  const emissive = highlight ? "#3a2412" : "#000000";

  let body: React.ReactNode;
  switch (obj.kind) {
    case "door":
    case "exit": {
      const axis = doorAxis(map, obj.position);
      const open = state === "open" || state === "broken";
      const color = state === "locked" ? "#5a2a24" : obj.kind === "exit" ? "#3b3326" : "#4a3626";
      const rot = (axis === "x" ? 0 : Math.PI / 2) + (open ? Math.PI / 2 : 0);
      body = (
        <group rotation={[0, rot, 0]}>
          <mesh position={open ? [0.42, state === "broken" ? 0.2 : 1.05, 0.42] : [0, 1.05, 0]} rotation={state === "broken" ? [Math.PI / 2.4, 0, 0] : [0, 0, 0]}>
            <boxGeometry args={[0.92, 2.1, 0.12]} />
            <meshStandardMaterial color={color} emissive={emissive} roughness={0.7} />
          </mesh>
          {obj.kind === "exit" && (
            <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.9, 0.9]} />
              <meshBasicMaterial color="#6fae7c" transparent opacity={0.18} />
            </mesh>
          )}
        </group>
      );
      break;
    }
    case "container": {
      const open = state !== "closed" && state !== "locked";
      body = (
        <group>
          <mesh position={[0, 0.3, 0]}>
            <boxGeometry args={[0.7, 0.6, 0.5]} />
            <meshStandardMaterial color={obj.model === "toolbox" ? "#7a2f22" : "#5b4532"} emissive={emissive} roughness={0.6} metalness={obj.model === "toolbox" ? 0.4 : 0} />
          </mesh>
          <mesh position={open ? [0, 0.66, -0.25] : [0, 0.63, 0]} rotation={open ? [-1.1, 0, 0] : [0, 0, 0]}>
            <boxGeometry args={[0.72, 0.06, 0.52]} />
            <meshStandardMaterial color="#3d2f22" emissive={emissive} />
          </mesh>
        </group>
      );
      break;
    }
    case "clue": {
      const found = state === "found";
      body = (
        <group>
          <mesh position={[0, obj.model === "wall-mark" || obj.model === "board" ? 0.9 : 0.12, 0]}>
            {obj.model === "candles" || obj.model === "gears" ? <torusGeometry args={[0.3, 0.05, 8, 24]} /> : <boxGeometry args={[0.45, obj.model === "wall-mark" || obj.model === "board" ? 0.6 : 0.08, 0.35]} />}
            <meshStandardMaterial color="#cdbf9e" emissive={emissive} roughness={0.9} />
          </mesh>
          {!found && (
            <mesh ref={glow} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.18, 0.24, 24]} />
              <meshBasicMaterial color="#d6a55a" transparent opacity={0.55} />
            </mesh>
          )}
        </group>
      );
      break;
    }
    case "npc": {
      const color = state === "hostile" ? "#7a2a24" : "#6c7a8a";
      body = (
        <group rotation={state === "dead" ? [0, 0, Math.PI / 2] : [0, 0, 0]} position={state === "dead" ? [0, -0.35, 0] : [0, 0, 0]}>
          <mesh position={[0, 0.55, 0]}>
            <capsuleGeometry args={[0.22, 0.6, 4, 12]} />
            <meshStandardMaterial color={color} emissive={emissive} roughness={0.7} />
          </mesh>
          <mesh position={[0, 1.08, 0]}>
            <sphereGeometry args={[0.17, 16, 16]} />
            <meshStandardMaterial color="#c9b29a" emissive={emissive} />
          </mesh>
        </group>
      );
      break;
    }
    case "threat": {
      const element = obj.model.replace("threat-", "");
      const c = ELEMENT_COLORS[element] ?? "#c0262d";
      const active = state === "active";
      body = (
        <group ref={group}>
          <mesh position={[0, active ? 0.95 : 0.6, 0]}>
            <icosahedronGeometry args={[active ? 0.6 : 0.42, 0]} />
            <meshStandardMaterial color="#0a0809" emissive={c} emissiveIntensity={active ? 0.6 : 0.15} roughness={0.4} flatShading />
          </mesh>
          {active && <pointLight color={c} intensity={6} distance={5} position={[0, 1.2, 0]} />}
        </group>
      );
      break;
    }
    case "artifact": {
      const tint = state === "sealed" ? "#7b8fe0" : state === "destroyed" ? "#2a2a2a" : "#d9b44a";
      body = (
        <group>
          <mesh position={[0, 0.35, 0]}>
            <cylinderGeometry args={[0.35, 0.4, 0.7, 12]} />
            <meshStandardMaterial color="#2a211b" emissive={emissive} />
          </mesh>
          {state !== "destroyed" && (
            <mesh ref={glow} position={[0, 0.9, 0]}>
              <octahedronGeometry args={[0.22, 0]} />
              <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={0.8} />
            </mesh>
          )}
          {state !== "destroyed" && <pointLight color={tint} intensity={3} distance={4} position={[0, 1.1, 0]} />}
        </group>
      );
      break;
    }
    case "item":
      body = (
        <mesh ref={glow} position={[0, 0.15, 0]}>
          <boxGeometry args={[0.25, 0.12, 0.25]} />
          <meshStandardMaterial color="#d6a55a" emissive="#5a3c12" metalness={0.5} />
        </mesh>
      );
      break;
    default:
      body = (
        <mesh position={[0, 0.4, 0]}>
          <boxGeometry args={[0.6, 0.8, 0.6]} />
          <meshStandardMaterial color="#4a3a2c" emissive={emissive} />
        </mesh>
      );
  }

  return (
    <group position={[obj.position.x, 0, obj.position.y]} {...handlers}>
      {/* Generous invisible hit box so small props are easy to click. */}
      <mesh position={[0, 0.6, 0]} visible={false}>
        <boxGeometry args={[0.9, 1.2, 0.9]} />
      </mesh>
      {body}
      {ring}
    </group>
  );
}
