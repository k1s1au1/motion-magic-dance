import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { audio } from "@/engine/audio";
import { HandCursors, NeonFloor, StageLights } from "@/engine/kit";
import { toWorldX, toWorldY, type GameDef, type GameSceneProps } from "@/engine/game";

type Pad = { on: boolean; side: 0 | 1; x: number; y: number; z: number; hit: number };

const N = 10;

function BoxingScene({ frame }: GameSceneProps) {
  const pads = useRef<Pad[]>(Array.from({ length: N }, () => ({ on: false, side: 0, x: 0, y: 0, z: 0, hit: 0 })));
  const meshes = useRef<(THREE.Group | null)[]>([]);
  const spawn = useRef(0.8);
  const ring = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const f = frame();
    const { dt, events, fx, score, diff } = f;

    spawn.current -= dt * diff.rate;
    if (spawn.current <= 0) {
      spawn.current = 0.75 + Math.random() * 0.5;
      const p = pads.current.find((q) => !q.on);
      if (p) {
        p.on = true;
        p.side = Math.random() < 0.5 ? 0 : 1;
        p.x = (p.side === 0 ? -1 : 1) * (1.4 + Math.random() * 1.6);
        p.y = -0.6 + Math.random() * 2.2;
        p.z = -20;
        p.hit = 0;
      }
    }

    const punchL = events.some((e) => e.type === "punchLeft");
    const punchR = events.some((e) => e.type === "punchRight");

    pads.current.forEach((p, i) => {
      const g = meshes.current[i];
      if (!p.on) {
        if (g) g.visible = false;
        return;
      }
      p.z += 9 * diff.speed * dt;
      if (p.hit > 0) {
        p.hit += dt * 4;
        if (p.hit > 1) p.on = false;
      } else {
        const inWindow = p.z > -3.4 && p.z < 1.6;
        const punched = p.side === 0 ? punchL : punchR;
        if (inWindow && punched) {
          const perfect = Math.abs(p.z + 0.6) < 1.1;
          score.hit(120, perfect ? "perfect" : "good");
          p.hit = 0.01;
          fx.burst(p.x, p.y, p.z, perfect ? "#ffd166" : "#3ad1ff", perfect ? 1.5 : 1);
          fx.floatText(perfect ? "PERFECT" : "GOOD", perfect ? "#ffd166" : "#3ad1ff");
          fx.screenFlash("255,220,120", perfect ? 0.35 : 0.18);
          perfect ? audio.perfect() : audio.good();
        } else if (p.z > 2.4) {
          p.on = false;
          score.miss();
          audio.miss();
          fx.floatText("MISS", "#ff6b6b");
        }
      }
      if (g) {
        g.visible = true;
        const s = p.hit > 0 ? 1 + p.hit * 1.6 : 1;
        g.position.set(p.x, p.y, p.z);
        g.scale.setScalar(s);
        g.rotation.z += dt * 1.2;
        const m = (g.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
        m.opacity = p.hit > 0 ? Math.max(0, 1 - p.hit) : 1;
      }
    });

    if (ring.current) ring.current.rotation.z += dt * 0.15;
  });

  return (
    <>
      <StageLights key2="#ff4d7d" />
      <NeonFloor color="#ff4d7d" speed={6} />
      <mesh ref={ring} position={[0, 0.4, -14]}>
        <torusGeometry args={[7, 0.12, 8, 60]} />
        <meshStandardMaterial color="#ff4d7d" emissive="#ff4d7d" emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
      {pads.current.map((p, i) => (
        <group
          key={i}
          ref={(el) => {
            meshes.current[i] = el;
          }}
          visible={false}
        >
          <mesh>
            <sphereGeometry args={[0.62, 24, 20]} />
            <meshStandardMaterial
              color={i % 2 === 0 ? "#12203a" : "#12203a"}
              emissive={p.side === 0 ? "#2f7bff" : "#ff5fa2"}
              emissiveIntensity={1.4}
              roughness={0.25}
              metalness={0.5}
              transparent
            />
          </mesh>
          <mesh rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.95, 0.07, 8, 36]} />
            <meshStandardMaterial
              color={p.side === 0 ? "#2f7bff" : "#ff5fa2"}
              emissive={p.side === 0 ? "#2f7bff" : "#ff5fa2"}
              emissiveIntensity={2}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
      <HandCursors frame={frame} left="#2f7bff" right="#ff5fa2" size={0.4} />
    </>
  );
}

export const boxing: GameDef = {
  id: "boxing",
  title: "ملاكمة الحركة",
  tagline: "الكم الأهداف قبل ما توصلك",
  howto: "الهدف الأزرق للكمة اليسرى، والوردي للكمة اليمنى — الكم بسرعة وقوة",
  duration: 70,
  accent: "#ff4d7d",
  accent2: "#2f7bff",
  emoji: "🥊",
  bg: "#0a0714",
  fogNear: 8,
  fogFar: 30,
  camera: [0, 0.6, 8],
  Scene: BoxingScene,
};
