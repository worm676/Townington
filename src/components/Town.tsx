"use client";
import { CameraControls, Html } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { AGENTS, type AgentConfig, type BuildingStyle } from "@/lib/agents";
import { isAway, type AgentStatus } from "@/lib/agentStatus";
import { STATUS_COLOR } from "@/lib/types";

const BUILDING_RADIUS = 15;
const DOOR_RADIUS = 11.2;
const HOME_RADIUS = 3.4;
const WALK_SPEED = 3.2;

interface Layout {
  angle: number;
  building: THREE.Vector3;
  door: THREE.Vector3;
  home: THREE.Vector3;
  facing: number; // rotation.y so a building's +z faces the plaza
}

function layoutFor(i: number, n: number): Layout {
  const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
  const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
  const building = dir.clone().multiplyScalar(BUILDING_RADIUS);
  return {
    angle,
    building,
    door: dir.clone().multiplyScalar(DOOR_RADIUS),
    home: dir.clone().multiplyScalar(HOME_RADIUS),
    facing: Math.atan2(-building.x, -building.z),
  };
}

export interface TownProps {
  statuses: Record<string, AgentStatus>;
  selected: string | null;
  onSelect: (id: string) => void;
}

export default function Town({ statuses, selected, onSelect }: TownProps) {
  const layouts = useMemo(() => AGENTS.map((_, i) => layoutFor(i, AGENTS.length)), []);
  const positions = useRef<Record<string, THREE.Vector3>>({});

  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [30, 28, 30], fov: 32, near: 0.5, far: 400 }}>
      <color attach="background" args={["#0f1624"]} />
      <fog attach="fog" args={["#0f1624", 70, 140]} />
      <hemisphereLight args={["#dfe9ff", "#3a4a2a", 0.9]} />
      <directionalLight
        position={[18, 30, 12]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />

      <Ground layouts={layouts} />
      <Fountain />

      {AGENTS.map((a, i) => (
        <Building
          key={a.id}
          agent={a}
          layout={layouts[i]}
          active={isAway(statuses[a.id] ?? "idle")}
          onClick={() => onSelect(a.id)}
        />
      ))}

      {AGENTS.map((a, i) => (
        <Agent
          key={a.id}
          agent={a}
          layout={layouts[i]}
          status={statuses[a.id] ?? "idle"}
          selected={selected === a.id}
          onClick={() => onSelect(a.id)}
          positions={positions.current}
        />
      ))}

      <CameraRig selected={selected} positions={positions.current} />
    </Canvas>
  );
}

// ---------------------------------------------------------------- camera

function CameraRig({
  selected,
  positions,
}: {
  selected: string | null;
  positions: Record<string, THREE.Vector3>;
}) {
  const ref = useRef<CameraControls>(null);
  const target = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    if (!selected) {
      c.setLookAt(30, 28, 30, 0, 0, 0, true);
      return;
    }
    const p = positions[selected];
    if (p) c.setLookAt(p.x + 13, p.y + 12, p.z + 13, p.x, p.y + 1, p.z, true);
  }, [selected, positions]);

  // Follow the selected agent as it walks.
  useFrame(() => {
    const c = ref.current;
    if (!c || !selected) return;
    const p = positions[selected];
    if (!p) return;
    c.getTarget(target);
    if (target.distanceTo(new THREE.Vector3(p.x, p.y + 1, p.z)) > 0.15) c.moveTo(p.x, p.y + 1, p.z, true);
  });

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={6}
      maxDistance={90}
      maxPolarAngle={Math.PI / 2.3}
      smoothTime={0.35}
    />
  );
}

// ---------------------------------------------------------------- world

/** Lerp an angle along the shortest arc. */
function turnToward(from: number, to: number, k: number) {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + d * k;
}

function seeded(n: number) {
  const x = Math.sin(n * 9301.17) * 49297.31;
  return x - Math.floor(x);
}

function Ground({ layouts }: { layouts: Layout[] }) {
  const trees = useMemo(() => {
    const out: { pos: [number, number, number]; s: number }[] = [];
    for (let i = 0; out.length < 70 && i < 600; i++) {
      const r = 7 + seeded(i) * 30;
      const a = seeded(i + 1000) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // Keep clear of roads and buildings.
      const blocked = layouts.some((l) => {
        const along = x * Math.cos(l.angle) + z * Math.sin(l.angle);
        const across = Math.abs(-x * Math.sin(l.angle) + z * Math.cos(l.angle));
        return (along > 0 && along < 19.5 && across < 3.8) || l.building.distanceTo(new THREE.Vector3(x, 0, z)) < 6;
      });
      if (!blocked) out.push({ pos: [x, 0, z], s: 0.7 + seeded(i + 2000) * 0.7 });
    }
    return out;
  }, [layouts]);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[46, 48]} />
        <meshStandardMaterial color="#5f8f4e" flatShading />
      </mesh>
      {/* plaza */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.02} receiveShadow>
        <circleGeometry args={[6.5, 12]} />
        <meshStandardMaterial color="#c9c2b2" flatShading />
      </mesh>
      {/* roads */}
      {layouts.map((l, i) => (
        <mesh
          key={i}
          position={[Math.cos(l.angle) * 9.5, 0.015, Math.sin(l.angle) * 9.5]}
          rotation={[-Math.PI / 2, 0, -l.angle]}
          receiveShadow
        >
          <planeGeometry args={[7, 2.4]} />
          <meshStandardMaterial color="#a9a293" flatShading />
        </mesh>
      ))}
      {trees.map((t, i) => (
        <group key={i} position={t.pos} scale={t.s}>
          <mesh position-y={0.5} castShadow>
            <cylinderGeometry args={[0.15, 0.2, 1, 5]} />
            <meshStandardMaterial color="#6b4a2f" flatShading />
          </mesh>
          <mesh position-y={1.6} castShadow>
            <coneGeometry args={[0.9, 2, 6]} />
            <meshStandardMaterial color={i % 3 ? "#2f6b3a" : "#3d7d45"} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Fountain() {
  const water = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (water.current) water.current.position.y = 0.55 + Math.sin(clock.elapsedTime * 2) * 0.03;
  });
  return (
    <group>
      <mesh position-y={0.25} castShadow receiveShadow>
        <cylinderGeometry args={[1.6, 1.8, 0.5, 10]} />
        <meshStandardMaterial color="#9d968a" flatShading />
      </mesh>
      <mesh ref={water} position-y={0.55}>
        <cylinderGeometry args={[1.35, 1.35, 0.1, 10]} />
        <meshStandardMaterial color="#5ab0e0" flatShading />
      </mesh>
      <mesh position-y={1.1} castShadow>
        <cylinderGeometry args={[0.18, 0.25, 1.2, 6]} />
        <meshStandardMaterial color="#b5ae9f" flatShading />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- buildings

function Mat({ color, emissive, intensity = 0 }: { color: string; emissive?: string; intensity?: number }) {
  return (
    <meshStandardMaterial
      color={color}
      emissive={emissive ?? "#000000"}
      emissiveIntensity={intensity}
      flatShading
    />
  );
}

function Building({
  agent,
  layout,
  active,
  onClick,
}: {
  agent: AgentConfig;
  layout: Layout;
  active: boolean;
  onClick: () => void;
}) {
  const glow = active ? 0.9 : 0.05;
  return (
    <group
      position={layout.building}
      rotation-y={layout.facing}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <BuildingShape style={agent.building.style} color={agent.color} glow={glow} />
      {/* door, on the plaza-facing side */}
      <mesh position={[0, 0.8, 2.52]}>
        <boxGeometry args={[1, 1.6, 0.1]} />
        <Mat color="#3b2a1e" />
      </mesh>
      <Html position={[0, 0.2, 3.6]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
        <div className="whitespace-nowrap rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white/90">
          {agent.building.name}
        </div>
      </Html>
    </group>
  );
}

function Windows({ y, color, glow, width = 5 }: { y: number; color: string; glow: number; width?: number }) {
  const n = Math.max(2, Math.floor(width / 1.4));
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} position={[(i - (n - 1) / 2) * 1.3, y, 2.52]}>
          <boxGeometry args={[0.7, 0.6, 0.08]} />
          <Mat color="#e8f1ff" emissive={color} intensity={glow} />
        </mesh>
      ))}
    </>
  );
}

function BuildingShape({ style, color, glow }: { style: BuildingStyle; color: string; glow: number }) {
  const wall = "#e9e3d6";
  switch (style) {
    case "tower":
      return (
        <group>
          <mesh position-y={2} castShadow receiveShadow>
            <boxGeometry args={[5, 4, 5]} />
            <Mat color={wall} />
          </mesh>
          <mesh position-y={5.5} castShadow>
            <boxGeometry args={[3.8, 3, 3.8]} />
            <Mat color={wall} />
          </mesh>
          <mesh position-y={7.6} castShadow>
            <boxGeometry args={[2.6, 1.2, 2.6]} />
            <Mat color={color} />
          </mesh>
          <mesh position-y={9.2} castShadow>
            <cylinderGeometry args={[0.06, 0.06, 2, 4]} />
            <Mat color="#888" />
          </mesh>
          <mesh position-y={10.2}>
            <sphereGeometry args={[0.18, 6, 6]} />
            <Mat color={color} emissive={color} intensity={0.4 + glow} />
          </mesh>
          <Windows y={2.6} color={color} glow={glow} />
        </group>
      );
    case "office":
      return (
        <group>
          <mesh position-y={1.75} castShadow receiveShadow>
            <boxGeometry args={[6, 3.5, 5]} />
            <Mat color={wall} />
          </mesh>
          <mesh position-y={3.65} castShadow>
            <boxGeometry args={[6.4, 0.3, 5.4]} />
            <Mat color={color} />
          </mesh>
          <mesh position={[0, 4.4, 1.8]} castShadow>
            <boxGeometry args={[3, 1, 0.2]} />
            <Mat color={color} emissive={color} intensity={glow * 0.5} />
          </mesh>
          <Windows y={2.4} color={color} glow={glow} width={6} />
        </group>
      );
    case "studio":
      return (
        <group>
          <mesh position-y={1.6} castShadow receiveShadow>
            <boxGeometry args={[5, 3.2, 5]} />
            <Mat color={wall} />
          </mesh>
          <mesh position-y={4.6} rotation-y={Math.PI / 4} castShadow>
            <coneGeometry args={[4.1, 2.8, 4]} />
            <Mat color={color} />
          </mesh>
          <Windows y={2.2} color={color} glow={glow} />
        </group>
      );
    case "workshop":
      return (
        <group>
          <mesh position-y={1.5} castShadow receiveShadow>
            <boxGeometry args={[6, 3, 5]} />
            <Mat color={wall} />
          </mesh>
          {/* gable roof: triangular prism */}
          <mesh position-y={3.9} rotation-z={Math.PI / 2} rotation-y={Math.PI / 2} castShadow>
            <cylinderGeometry args={[2.1, 2.1, 6.2, 3]} />
            <Mat color={color} />
          </mesh>
          <mesh position={[1.8, 4.6, -1]} castShadow>
            <boxGeometry args={[0.7, 2, 0.7]} />
            <Mat color="#7a6b5d" />
          </mesh>
          <Windows y={2.1} color={color} glow={glow} width={6} />
        </group>
      );
    case "vault":
      return (
        <group>
          <mesh position-y={1.6} castShadow receiveShadow>
            <cylinderGeometry args={[2.8, 3, 3.2, 8]} />
            <Mat color={wall} />
          </mesh>
          <mesh position-y={3.2} castShadow>
            <sphereGeometry args={[2.8, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <Mat color={color} />
          </mesh>
          <mesh position={[0, 1.2, 2.55]}>
            <boxGeometry args={[1.6, 2.2, 0.3]} />
            <Mat color="#8f9aa5" emissive={color} intensity={glow * 0.4} />
          </mesh>
        </group>
      );
    case "library":
      return (
        <group>
          <mesh position-y={0.25} castShadow receiveShadow>
            <boxGeometry args={[6.4, 0.5, 5.4]} />
            <Mat color="#cfc8b8" />
          </mesh>
          <mesh position={[0, 2, -0.6]} castShadow receiveShadow>
            <boxGeometry args={[5.6, 3.5, 3.6]} />
            <Mat color={wall} />
          </mesh>
          {[-2.4, -1.2, 1.2, 2.4].map((x) => (
            <mesh key={x} position={[x, 2, 2]} castShadow>
              <cylinderGeometry args={[0.22, 0.22, 3.5, 6]} />
              <Mat color="#f4f0e6" />
            </mesh>
          ))}
          <mesh position={[0, 4.35, 0.4]} rotation-z={Math.PI / 2} rotation-y={Math.PI / 2} castShadow>
            <cylinderGeometry args={[1.3, 1.3, 6.2, 3]} />
            <Mat color={color} />
          </mesh>
          <mesh position={[0, 2.4, 1.15]}>
            <boxGeometry args={[3, 0.8, 0.1]} />
            <Mat color="#e8f1ff" emissive={color} intensity={glow} />
          </mesh>
        </group>
      );
  }
}

// ---------------------------------------------------------------- agents

function Agent({
  agent,
  layout,
  status,
  selected,
  onClick,
  positions,
}: {
  agent: AgentConfig;
  layout: Layout;
  status: AgentStatus;
  selected: boolean;
  onClick: () => void;
  positions: Record<string, THREE.Vector3>;
}) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Mesh>(null);
  const legR = useRef<THREE.Mesh>(null);
  const armL = useRef<THREE.Mesh>(null);
  const armR = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useRef<THREE.MeshStandardMaterial>(null);
  const pos = useMemo(() => layout.home.clone(), [layout]);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const ringColor = STATUS_COLOR[status];
  const away = isAway(status);

  positions[agent.id] = pos;

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const goal = away ? layout.door : layout.home;
    tmp.copy(goal).sub(pos);
    tmp.y = 0;
    const dist = tmp.length();
    const moving = dist > 0.05;
    if (moving) {
      const step = Math.min(dist, WALK_SPEED * Math.min(dt, 0.1));
      pos.addScaledVector(tmp.normalize(), step);
      if (root.current) {
        const heading = Math.atan2(tmp.x, tmp.z);
        root.current.rotation.y = turnToward(root.current.rotation.y, heading, 0.2);
      }
    } else if (root.current) {
      // Idle: face the building — through its door when working, from the plaza otherwise.
      const face = Math.atan2(layout.building.x - pos.x, layout.building.z - pos.z);
      root.current.rotation.y = turnToward(root.current.rotation.y, face, 0.08);
    }
    root.current?.position.copy(pos);

    const swing = moving ? Math.sin(t * 10) * 0.6 : status === "working" ? Math.sin(t * 6) * 0.15 : 0;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armL.current) armL.current.rotation.x = -swing * 0.8;
    if (armR.current) armR.current.rotation.x = status === "working" && !moving ? -1.2 + Math.sin(t * 8) * 0.3 : swing * 0.8;
    if (body.current) body.current.position.y = moving ? Math.abs(Math.sin(t * 10)) * 0.08 : 0;

    if (ring.current && ringMat.current) {
      const pulse = status === "working" || status === "queued" || status === "needs_input";
      const s = pulse ? 1 + Math.sin(t * 4) * 0.08 : 1;
      ring.current.scale.set(s, s, s);
      ringMat.current.emissiveIntensity = pulse ? 0.6 + Math.sin(t * 4) * 0.3 : 0.35;
    }
  });

  return (
    <group
      ref={root}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      {/* status ring */}
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.06}>
        <torusGeometry args={[0.75, 0.09, 6, 24]} />
        <meshStandardMaterial ref={ringMat} color={ringColor} emissive={ringColor} emissiveIntensity={0.4} />
      </mesh>
      {selected && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.04}>
          <ringGeometry args={[0.95, 1.1, 24]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
        </mesh>
      )}

      <group ref={body}>
        <mesh ref={legL} position={[-0.17, 0.55, 0]} castShadow>
          <boxGeometry args={[0.22, 0.6, 0.24]} />
          <Mat color="#2d3748" />
        </mesh>
        <mesh ref={legR} position={[0.17, 0.55, 0]} castShadow>
          <boxGeometry args={[0.22, 0.6, 0.24]} />
          <Mat color="#2d3748" />
        </mesh>
        <mesh position-y={1.2} castShadow>
          <boxGeometry args={[0.7, 0.8, 0.4]} />
          <Mat color={agent.color} />
        </mesh>
        <mesh ref={armL} position={[-0.47, 1.25, 0]} castShadow>
          <boxGeometry args={[0.18, 0.65, 0.2]} />
          <Mat color={agent.color} />
        </mesh>
        <mesh ref={armR} position={[0.47, 1.25, 0]} castShadow>
          <boxGeometry args={[0.18, 0.65, 0.2]} />
          <Mat color={agent.color} />
        </mesh>
        <mesh position-y={1.9} castShadow>
          <icosahedronGeometry args={[0.32, 0]} />
          <Mat color="#f1c9a5" />
        </mesh>
        {agent.id === "chief" && (
          <mesh position-y={2.25} castShadow>
            <cylinderGeometry args={[0.22, 0.26, 0.25, 6]} />
            <Mat color="#1f2937" />
          </mesh>
        )}
      </group>

      <Html position={[0, 2.8, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
        <div className="flex flex-col items-center gap-0.5">
          {status === "needs_input" && (
            <div className="animate-bounce rounded-full bg-amber-400 px-1.5 text-xs font-bold text-black">!</div>
          )}
          <div
            className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold text-white shadow"
            style={{ background: `${agent.color}cc`, outline: selected ? "2px solid white" : "none" }}
          >
            {agent.name}
          </div>
        </div>
      </Html>
    </group>
  );
}
