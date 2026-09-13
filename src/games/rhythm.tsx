import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { audio } from "@/engine/audio";
import { HandCursors, StageLights } from "@/engine/kit";
import { toWorldX, toWorldY, type GameDef, type GameSceneProps } from "@/engine/game";

type Note = { on: boolean; lane: 0 | 1 | 2; y: number };

const N = 14;
const LANE_X = [-1.9, 0, 1.9];
const HIT_Y = -2.4;

function RhythmScene({ frame }: GameSceneProps) {
  const notes = useRef<Note[]>(Array.from({ length: N }, () => ({ on: false, lane: 0, y: 0 })));
  const groups = useRef<(THREE.Group | null)[]>([]);
  const spawn = useRef(0.8);
  const bar = useRef<THREE.Mesh>(null);
  const beat = useRef(0);

  useFrame(() => {
    const f = frame();
    const { dt, input, events, fx, score, diff } = f;
    beat.current += dt;

    spawn.current -= dt * diff.rate;
    if (spawn.current <= 0) {
      spawn.current = 0.55 + Math.random() * 0.3;
      const n = notes.current.find((q) => !q.on);
      if (n) {
        n.on = true;
        n.lane = Math.floor(Math.random() * 3) as 0 | 1 | 2;
        n.y = 5.2;
      }
    }

    const jumped = events.some((e) => e.type === "jump") || input.handsUp;
    const hands = [
      { x: toWorldX(input.handLeft.x), y: toWorldY(input.handLeft.y) },
      { x: toWorldX(input.handRight.x), y: toWorldY(input.handRight.y) },
    ];

    notes.current.forEach((n, i) => {
      const g = groups.current[i];
      if (!n.on) {
        if (g) g.visible = false;
        return;
      }
      n.y -= 5.6 * diff.speed * dt;
      const x = LANE_X[n.lane]!;
      const d = Math.abs(n.y - HIT_Y);
      if (d < 1.1) {
        const ok =
          n.lane === 1 ? jumped : hands.some((h) => Math.abs(h.x - x) < 1.5 && Math.abs(h.y - HIT_Y) < 1.6);
        if (ok) {
          n.on = false;
          const perfect = d < 0.5;
          score.hit(110, perfect ? "perfect" : "good");
          perfect ? audio.perfect() : audio.good();
          fx.burst(x, HIT_Y, 0, perfect ? "#ffd166" : "#3ad1ff", perfect ? 1.4 : 1, 28);
          fx.floatText(perfect ? "PERFECT" : "GOOD", perfect ? "#ffd166" : "#3ad1ff");
          return;
        }
      }
      if (n.y < HIT_Y - 1.4) {
        n.on = false;
        score.miss();
        audio.miss();
        fx.floatText("MISS", "#ff6b6b");
      }
      if (g) {
        g.visible = true;
        g.position.set(x, n.y, 0);
        g.rotation.y += dt * 2;
      }
    });

    if (bar.current) {
      const m = bar.current.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = 1.4 + Math.max(0, 1 - (beat.current % 0.46) * 3) * 2;
    }
  });

  return (
    <>
      <StageLights key2="#a05bff" />
      {LANE_X.map((x, i) => (
        <mesh key={i} position={[x, 0.6, -1.2]} rotation-x={-0.15}>
          <planeGeometry args={[1.7, 14]} />
          <meshStandardMaterial
            color="#1b0f38"
            emissive={i === 1 ? "#ffb020" : "#a05bff"}
            emissiveIntensity={0.35}
            transparent
            opacity={0.85}
          />
        </mesh>
      ))}
      <mesh ref={bar} position={[0, HIT_Y, 0.2]}>
        <boxGeometry args={[6, 0.16, 0.16]} />
        <meshStandardMaterial color="#ffffff" emissive="#3ad1ff" emissiveIntensity={2} toneMapped={false} />
      </mesh>

      {notes.current.map((n, i) => (
        <group
          key={i}
          ref={(el) => {
            groups.current[i] = el;
          }}
          visible={false}
        >
          <mesh castShadow>
            <icosahedronGeometry args={[0.62, 1]} />
            <meshStandardMaterial
              color={n.lane === 1 ? "#ffd166" : "#c79bff"}
              emissive={n.lane === 1 ? "#ff9f1c" : "#7a3ce0"}
              emissiveIntensity={1.5}
              roughness={0.2}
              metalness={0.6}
            />
          </mesh>
          <pointLight color={n.lane === 1 ? "#ffd166" : "#a05bff"} intensity={5} distance={4} />
        </group>
      ))}

      <HandCursors frame={frame} z={0.4} size={0.4} />
    </>
  );
}

export const rhythm: GameDef = {
  id: "rhythm",
  title: "نبض الحركة",
  tagline: "اضرب النوتة على الخط",
  howto: "المسار الأيسر بيدك اليسرى، الأوسط بالقفز أو رفع اليدين، والأيمن بيدك اليمنى",
  duration: 75,
  accent: "#a05bff",
  accent2: "#3ad1ff",
  emoji: "🎵",
  bg: "#0a0620",
  fogNear: 10,
  fogFar: 30,
  camera: [0, 0.4, 8.5],
  Scene: RhythmScene,
};
