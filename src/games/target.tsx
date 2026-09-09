import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { audio } from "@/engine/audio";
import { HandCursors, StageLights } from "@/engine/kit";
import { toWorldX, toWorldY, type GameDef, type GameSceneProps } from "@/engine/game";

type Orb = { on: boolean; bomb: boolean; p: THREE.Vector3; v: THREE.Vector3; r: number };

const N = 12;

function TargetScene({ frame }: GameSceneProps) {
  const orbs = useRef<Orb[]>(
    Array.from({ length: N }, () => ({
      on: false,
      bomb: false,
      p: new THREE.Vector3(),
      v: new THREE.Vector3(),
      r: 0.6,
    })),
  );
  const groups = useRef<(THREE.Group | null)[]>([]);
  const spawn = useRef(0.6);
  const hl = useRef(new THREE.Vector3());
  const hr = useRef(new THREE.Vector3());

  useFrame(() => {
    const f = frame();
    const { dt, input, fx, score, diff } = f;

    spawn.current -= dt * diff.rate;
    if (spawn.current <= 0) {
      spawn.current = 0.5 + Math.random() * 0.4;
      const o = orbs.current.find((q) => !q.on);
      if (o) {
        o.on = true;
        o.bomb = Math.random() < 0.18;
        o.r = o.bomb ? 0.55 : 0.5 + Math.random() * 0.3;
        o.p.set((Math.random() - 0.5) * 7, -4.4, (Math.random() - 0.5) * 2);
        o.v.set((Math.random() - 0.5) * 2, 7.4 * diff.speed, 0);
      }
    }

    hl.current.set(toWorldX(input.handLeft.x), toWorldY(input.handLeft.y), 0.6);
    hr.current.set(toWorldX(input.handRight.x), toWorldY(input.handRight.y), 0.6);
    const vl = Math.hypot(input.handLeftVel.x, input.handLeftVel.y);
    const vr = Math.hypot(input.handRightVel.x, input.handRightVel.y);

    orbs.current.forEach((o, i) => {
      const g = groups.current[i];
      if (!o.on) {
        if (g) g.visible = false;
        return;
      }
      o.v.y -= 7 * dt;
      o.p.addScaledVector(o.v, dt);
      if (o.p.y < -5.2) {
        o.on = false;
        if (!o.bomb) score.miss();
        return;
      }
      const hitL = hl.current.distanceTo(o.p) < o.r + 0.55 && vl > 0.45;
      const hitR = hr.current.distanceTo(o.p) < o.r + 0.55 && vr > 0.45;
      if (hitL || hitR) {
        o.on = false;
        if (o.bomb) {
          score.miss();
          score.points = Math.max(0, score.points - 150);
          audio.miss();
          fx.burst(o.p.x, o.p.y, o.p.z, "#ff3b3b", 1.8, 40);
          fx.screenFlash("255,60,60", 0.6);
          fx.floatText("قنبلة!", "#ff4d4d");
        } else {
          score.hit(100, o.r < 0.6 ? "perfect" : "good");
          audio.perfect();
          fx.burst(o.p.x, o.p.y, o.p.z, "#2ee6a8", 1.1, 30);
          fx.floatText(`+${score.combo}x`, "#8dffc8");
        }
        return;
      }
      if (g) {
        g.visible = true;
        g.position.copy(o.p);
        g.scale.setScalar(o.r);
        g.rotation.y += dt * 1.4;
      }
    });
  });

  return (
    <>
      <StageLights key2="#2ee6a8" />
      <mesh position={[0, 0, -12]}>
        <planeGeometry args={[40, 24]} />
        <meshStandardMaterial color="#062033" roughness={1} />
      </mesh>
      {Array.from({ length: 18 }).map((_, i) => (
        <mesh key={i} position={[((i * 137) % 30) - 15, ((i * 71) % 14) - 7, -9 - (i % 4)]}>
          <sphereGeometry args={[0.06, 6, 6]} />
          <meshBasicMaterial color="#67d8ff" toneMapped={false} />
        </mesh>
      ))}

      {orbs.current.map((o, i) => (
        <group
          key={i}
          ref={(el) => {
            groups.current[i] = el;
          }}
          visible={false}
        >
          <mesh castShadow>
            <sphereGeometry args={[1, 26, 22]} />
            <meshPhysicalMaterial
              color={o.bomb ? "#e01b1b" : "#7ef7d0"}
              emissive={o.bomb ? "#ff2020" : "#0f9d78"}
              emissiveIntensity={o.bomb ? 1.4 : 0.7}
              transmission={o.bomb ? 0 : 0.5}
              thickness={1}
              roughness={0.1}
              metalness={0.1}
            />
          </mesh>
          <pointLight color={o.bomb ? "#ff3b3b" : "#2ee6a8"} intensity={6} distance={5} />
        </group>
      ))}

      <HandCursors frame={frame} size={0.42} />
    </>
  );
}

export const target: GameDef = {
  id: "target",
  title: "كاسر الفقاعات",
  tagline: "حطّم الفقاعات وتجنّب القنابل",
  howto: "حرّك يديك بسرعة فوق الفقاعات الخضراء لتحطيمها، وابتعد عن الكرات الحمراء",
  duration: 70,
  accent: "#2ee6a8",
  accent2: "#3ad1ff",
  emoji: "🫧",
  bg: "#04121a",
  fogNear: 12,
  fogFar: 34,
  camera: [0, 0, 9],
  Scene: TargetScene,
};
