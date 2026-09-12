import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { audio } from "@/engine/audio";
import { HandCursors, StageLights } from "@/engine/kit";
import { toWorldX, toWorldY, type GameDef, type GameSceneProps } from "@/engine/game";

type Ball = { on: boolean; p: THREE.Vector3; target: THREE.Vector3; speed: number; done: boolean; spin: number };

const N = 6;

function GoalieScene({ frame }: GameSceneProps) {
  const balls = useRef<Ball[]>(
    Array.from({ length: N }, () => ({
      on: false,
      p: new THREE.Vector3(),
      target: new THREE.Vector3(),
      speed: 1,
      done: false,
      spin: 0,
    })),
  );
  const groups = useRef<(THREE.Group | null)[]>([]);
  const spawn = useRef(1.2);

  useFrame(() => {
    const f = frame();
    const { dt, input, fx, score, diff } = f;

    spawn.current -= dt * diff.rate;
    if (spawn.current <= 0) {
      spawn.current = 1.3 / diff.rate;
      const b = balls.current.find((q) => !q.on);
      if (b) {
        b.on = true;
        b.done = false;
        b.speed = (13 + Math.random() * 4) * diff.speed;
        b.p.set((Math.random() - 0.5) * 4, 1 + Math.random() * 1.5, -26);
        b.target.set((Math.random() - 0.5) * 6.5, -1.8 + Math.random() * 3.4, 1);
        b.spin = 0;
      }
    }

    const hl = new THREE.Vector3(toWorldX(input.handLeft.x), toWorldY(input.handLeft.y), 0.8);
    const hr = new THREE.Vector3(toWorldX(input.handRight.x), toWorldY(input.handRight.y), 0.8);

    balls.current.forEach((b, i) => {
      const g = groups.current[i];
      if (!b.on) {
        if (g) g.visible = false;
        return;
      }
      const dir = b.target.clone().sub(b.p).normalize();
      b.p.addScaledVector(dir, b.speed * dt);
      b.spin += dt * 8;
      if (!b.done && b.p.z > -1.6) {
        const saved = hl.distanceTo(b.p) < 1.15 || hr.distanceTo(b.p) < 1.15;
        if (saved) {
          b.done = true;
          b.on = false;
          score.hit(140, "perfect");
          audio.perfect();
          fx.burst(b.p.x, b.p.y, b.p.z, "#ffd166", 1.5, 34);
          fx.floatText("صدّها!", "#ffd166");
          return;
        }
      }
      if (b.p.z > 2) {
        b.on = false;
        if (!b.done) {
          score.miss();
          audio.miss();
          fx.screenFlash("255,60,60", 0.5);
          fx.floatText("هدف علينا", "#ff6b6b");
        }
        return;
      }
      if (g) {
        g.visible = true;
        g.position.copy(b.p);
        g.rotation.set(b.spin, b.spin * 0.7, 0);
      }
    });
  });

  return (
    <>
      <StageLights key1="#eaffea" key2="#2ee6a8" />
      <mesh rotation-x={-Math.PI / 2} position={[0, -3.4, -10]} receiveShadow>
        <planeGeometry args={[50, 60]} />
        <meshStandardMaterial color="#0d3a20" roughness={0.9} />
      </mesh>
      {Array.from({ length: 10 }).map((_, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[0, -3.38, -4 - i * 5]}>
          <planeGeometry args={[50, 2.4]} />
          <meshStandardMaterial color="#114d28" roughness={0.9} opacity={0.25} transparent />
        </mesh>
      ))}
      {/* إطار المرمى */}
      <group position={[0, -0.4, 1.4]}>
        <mesh position={[-5.2, 0, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 6, 12]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.4} />
        </mesh>
        <mesh position={[5.2, 0, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 6, 12]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.4} />
        </mesh>
        <mesh position={[0, 3, 0]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.16, 0.16, 10.4, 12]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.4} />
        </mesh>
      </group>

      {balls.current.map((_, i) => (
        <group
          key={i}
          ref={(el) => {
            groups.current[i] = el;
          }}
          visible={false}
        >
          <mesh castShadow>
            <icosahedronGeometry args={[0.42, 1]} />
            <meshStandardMaterial color="#f5f5f5" roughness={0.4} metalness={0.1} />
          </mesh>
          <mesh scale={1.25}>
            <icosahedronGeometry args={[0.42, 1]} />
            <meshBasicMaterial color="#2ee6a8" transparent opacity={0.18} toneMapped={false} />
          </mesh>
        </group>
      ))}

      <HandCursors frame={frame} left="#ffd166" right="#ffd166" size={0.55} z={0.8} />
    </>
  );
}

export const goalie: GameDef = {
  id: "goalie",
  title: "حارس المرمى",
  tagline: "صدّ الكرات بيديك",
  howto: "الكرات تجيك من بعيد — مدّ يديك مكان الكرة قبل توصل المرمى",
  duration: 65,
  accent: "#2ee6a8",
  accent2: "#ffd166",
  emoji: "🥅",
  bg: "#04140c",
  fogNear: 14,
  fogFar: 42,
  camera: [0, 0.4, 8],
  Scene: GoalieScene,
};
