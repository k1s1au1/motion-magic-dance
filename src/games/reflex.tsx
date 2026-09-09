import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { audio } from "@/engine/audio";
import { NeonFloor, StageLights } from "@/engine/kit";
import type { MotionEventType } from "@/motion/types";
import type { GameDef, GameSceneProps } from "@/engine/game";

type Cmd = { type: MotionEventType; label: string; say: string; rot: [number, number, number]; color: string };

const CMDS: Cmd[] = [
  { type: "moveLeft", label: "يسار", say: "يسار", rot: [0, 0, Math.PI / 2], color: "#3ad1ff" },
  { type: "moveRight", label: "يمين", say: "يمين", rot: [0, 0, -Math.PI / 2], color: "#ffb020" },
  { type: "jump", label: "اقفز", say: "اقفز", rot: [0, 0, 0], color: "#2ee6a8" },
  { type: "squat", label: "انخفض", say: "انخفض", rot: [0, 0, Math.PI], color: "#a05bff" },
  { type: "handsUp", label: "ارفع يديك", say: "ارفع يديك", rot: [0, 0, 0], color: "#ff5fa2" },
  { type: "punchLeft", label: "لكمة يسار", say: "لكمة يسار", rot: [Math.PI / 2, 0, 0], color: "#2f7bff" },
  { type: "punchRight", label: "لكمة يمين", say: "لكمة يمين", rot: [Math.PI / 2, 0, 0], color: "#ff4d7d" },
];

function ReflexScene({ frame }: GameSceneProps) {
  const cur = useRef<Cmd | null>(null);
  const age = useRef(0);
  const wait = useRef(1);
  const arrow = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const f = frame();
    const { dt, events, fx, score, diff } = f;
    const limit = 1.9 * diff.window;

    if (!cur.current) {
      wait.current -= dt;
      if (wait.current <= 0) {
        const c = CMDS[Math.floor(Math.random() * CMDS.length)]!;
        cur.current = c;
        age.current = 0;
        audio.count(1);
        audio.say(c.say);
        fx.floatText(c.label, c.color, 0.5, 0.3);
      }
    } else {
      age.current += dt;
      const c = cur.current;
      if (events.some((e) => e.type === c.type)) {
        const fast = age.current < limit * 0.4;
        score.hit(fast ? 160 : 100, fast ? "perfect" : "good");
        fast ? audio.perfect() : audio.good();
        fx.burst(0, 0.4, 0, c.color, fast ? 1.6 : 1.1, 34);
        fx.floatText(`${fast ? "سريع!" : "صح"} ${Math.round(age.current * 1000)}ms`, c.color);
        cur.current = null;
        wait.current = 0.5 / diff.rate;
      } else if (age.current > limit) {
        score.miss();
        audio.miss();
        fx.screenFlash("255,60,60", 0.4);
        fx.floatText("فات الوقت", "#ff6b6b");
        cur.current = null;
        wait.current = 0.45 / diff.rate;
      }
    }

    const c = cur.current;
    if (arrow.current) {
      arrow.current.visible = !!c;
      if (c) {
        arrow.current.rotation.set(c.rot[0], c.rot[1], c.rot[2]);
        const pop = Math.min(1, age.current * 6);
        arrow.current.scale.setScalar(0.6 + pop * 0.5 + Math.sin(age.current * 12) * 0.04);
        const m = (arrow.current.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
        m.color.set(c.color);
        m.emissive.set(c.color);
      }
    }
    if (halo.current) {
      halo.current.rotation.z += dt * 0.6;
      const m = halo.current.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = c ? 2.2 : 0.5;
    }
  });

  return (
    <>
      <StageLights key2="#a05bff" />
      <NeonFloor color="#a05bff" speed={3} />
      <mesh ref={halo} position={[0, 0.4, -3]}>
        <torusGeometry args={[3.2, 0.1, 10, 60]} />
        <meshStandardMaterial color="#a05bff" emissive="#a05bff" emissiveIntensity={1} toneMapped={false} />
      </mesh>
      <group ref={arrow} position={[0, 0.4, 0]} visible={false}>
        <mesh castShadow>
          <coneGeometry args={[1.1, 2.2, 4]} />
          <meshStandardMaterial color="#3ad1ff" emissive="#3ad1ff" emissiveIntensity={1.8} toneMapped={false} />
        </mesh>
        <pointLight intensity={20} distance={10} color="#ffffff" />
      </group>
    </>
  );
}

export const reflex: GameDef = {
  id: "reflex",
  title: "رد الفعل",
  tagline: "نفّذ الأمر بأسرع وقت",
  howto: "تظهر أوامر حركية بسرعة — نفّذها بجسمك فوراً: يمين، يسار، قفز، انخفاض، لكمات",
  duration: 60,
  accent: "#a05bff",
  accent2: "#ffb020",
  emoji: "⚡",
  bg: "#0b0618",
  fogNear: 8,
  fogFar: 28,
  camera: [0, 0.6, 8],
  Scene: ReflexScene,
};
