import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { audio } from "@/engine/audio";
import { NeonFloor, StageLights } from "@/engine/kit";
import type { GameDef, GameSceneProps } from "@/engine/game";

type Kind = "wall" | "high" | "low";
type Ob = { on: boolean; lane: -1 | 0 | 1; kind: Kind; z: number; done: boolean };

const N = 8;
const LANE_X = 2.4;

function DodgeScene({ frame }: GameSceneProps) {
  const obs = useRef<Ob[]>(Array.from({ length: N }, () => ({ on: false, lane: 0, kind: "wall", z: 0, done: false })));
  const groups = useRef<(THREE.Group | null)[]>([]);
  const marker = useRef<THREE.Group>(null);
  const spawn = useRef(1);
  const tunnel = useRef<THREE.Group>(null);

  useFrame(() => {
    const f = frame();
    const { dt, input, fx, score, diff } = f;

    spawn.current -= dt * diff.rate;
    if (spawn.current <= 0) {
      spawn.current = 1 / diff.rate;
      const o = obs.current.find((q) => !q.on);
      if (o) {
        const r = Math.random();
        o.on = true;
        o.done = false;
        o.kind = r < 0.45 ? "wall" : r < 0.75 ? "high" : "low";
        o.lane = (Math.floor(Math.random() * 3) - 1) as -1 | 0 | 1;
        o.z = -34;
      }
    }

    const playerX = THREE.MathUtils.clamp(input.body.x * 2 - 1, -1, 1) * LANE_X;
    const crouch = input.squat;
    const jump = input.jump;
    if (marker.current) {
      marker.current.position.x += (playerX - marker.current.position.x) * Math.min(1, dt * 14);
      marker.current.position.y += ((jump ? 1.5 : crouch ? -1.9 : -0.9) - marker.current.position.y) * Math.min(1, dt * 12);
      marker.current.rotation.y += dt * 2;
    }

    obs.current.forEach((o, i) => {
      const g = groups.current[i];
      if (!o.on) {
        if (g) g.visible = false;
        return;
      }
      o.z += 15 * diff.speed * dt;
      if (!o.done && o.z > -1 && o.z < 1.4) {
        o.done = true;
        const px = marker.current?.position.x ?? 0;
        const sameLane = Math.abs(px - o.lane * LANE_X) < 1.5;
        let safe = !sameLane;
        if (sameLane) safe = o.kind === "high" ? crouch : o.kind === "low" ? jump : false;
        if (safe) {
          score.hit(90, "good");
          audio.good();
          fx.ring(o.lane * LANE_X, -0.6, 0, "#2ee6a8", 2);
          fx.floatText("نجوت!", "#2ee6a8");
        } else {
          score.miss();
          audio.miss();
          fx.burst(o.lane * LANE_X, -0.6, 0, "#ff4d4d", 1.6);
          fx.screenFlash("255,60,60", 0.55);
          fx.floatText("اصطدام", "#ff6b6b");
        }
      }
      if (o.z > 6) o.on = false;
      if (g) {
        g.visible = true;
        g.position.set(o.lane * LANE_X, o.kind === "high" ? 0.9 : o.kind === "low" ? -2.1 : -0.4, o.z);
      }
    });

    if (tunnel.current) tunnel.current.position.z = ((tunnel.current.position.z + dt * 18 * diff.speed) % 12) - 12;
  });

  return (
    <>
      <StageLights key1="#cfe8ff" key2="#3ad1ff" />
      <NeonFloor color="#3ad1ff" y={-3.2} speed={14} />
      <group ref={tunnel}>
        {Array.from({ length: 12 }).map((_, i) => (
          <mesh key={i} position={[0, 0, -i * 12 + 6]} rotation-x={Math.PI / 2}>
            <torusGeometry args={[7.5, 0.1, 6, 6]} />
            <meshStandardMaterial color="#1b3f6b" emissive="#2b6bd6" emissiveIntensity={1.2} toneMapped={false} />
          </mesh>
        ))}
      </group>

      {obs.current.map((o, i) => (
        <group
          key={i}
          ref={(el) => {
            groups.current[i] = el;
          }}
          visible={false}
        >
          <mesh castShadow>
            <boxGeometry args={o.kind === "wall" ? [2.4, 3.4, 0.5] : [2.4, 1.1, 0.5]} />
            <meshStandardMaterial
              color={o.kind === "wall" ? "#ff4d4d" : "#ffb020"}
              emissive={o.kind === "wall" ? "#ff2020" : "#ff8a00"}
              emissiveIntensity={0.9}
              roughness={0.35}
              metalness={0.5}
            />
          </mesh>
        </group>
      ))}

      <group ref={marker} position={[0, -0.9, 4]}>
        <mesh>
          <octahedronGeometry args={[0.6, 0]} />
          <meshStandardMaterial color="#2ee6a8" emissive="#2ee6a8" emissiveIntensity={2} toneMapped={false} />
        </mesh>
        <pointLight color="#2ee6a8" intensity={12} distance={8} />
      </group>
    </>
  );
}

export const dodge: GameDef = {
  id: "dodge",
  title: "تفادي العوائق",
  tagline: "يمين، يسار، اقفز، انخفض",
  howto: "تحرك يميناً أو يساراً بجسمك، اقفز فوق الحواجز المنخفضة، وانخفض تحت العالية",
  duration: 70,
  accent: "#3ad1ff",
  accent2: "#2ee6a8",
  emoji: "🛡️",
  bg: "#050b16",
  fogNear: 10,
  fogFar: 38,
  camera: [0, 1.4, 9],
  Scene: DodgeScene,
};
