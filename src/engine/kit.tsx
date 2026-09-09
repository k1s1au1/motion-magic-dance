import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { toWorldX, toWorldY, type Frame3D } from "./game";

/** مؤشرا اليدين المجرّدان (بدون أي شخصية) */
export function HandCursors({
  frame,
  left = "#3ad1ff",
  right = "#ff5fa2",
  z = 0.6,
  size = 0.34,
}: {
  frame: () => Frame3D;
  left?: string;
  right?: string;
  z?: number;
  size?: number;
}) {
  const l = useRef<THREE.Group>(null);
  const r = useRef<THREE.Group>(null);

  useFrame(() => {
    const f = frame();
    const i = f.input;
    if (l.current) {
      l.current.position.set(toWorldX(i.handLeft.x), toWorldY(i.handLeft.y), z);
      l.current.rotation.z += 0.03;
    }
    if (r.current) {
      r.current.position.set(toWorldX(i.handRight.x), toWorldY(i.handRight.y), z);
      r.current.rotation.z -= 0.03;
    }
  });

  return (
    <>
      <group ref={l}>
        <mesh>
          <torusGeometry args={[size, size * 0.16, 10, 28]} />
          <meshStandardMaterial color={left} emissive={left} emissiveIntensity={2.4} toneMapped={false} />
        </mesh>
        <pointLight color={left} intensity={4} distance={4} />
      </group>
      <group ref={r}>
        <mesh>
          <torusGeometry args={[size, size * 0.16, 10, 28]} />
          <meshStandardMaterial color={right} emissive={right} emissiveIntensity={2.4} toneMapped={false} />
        </mesh>
        <pointLight color={right} intensity={4} distance={4} />
      </group>
    </>
  );
}

/** أرضية شبكية نيون تعطي إحساس العمق */
export function NeonFloor({ color = "#2ee6a8", y = -3.4, speed = 4 }: { color?: string; y?: number; speed?: number }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!g.current) return;
    g.current.position.z = ((g.current.position.z + dt * speed) % 2) - 2;
  });
  return (
    <group ref={g} position={[0, y, 0]}>
      <gridHelper args={[60, 60, color, color]} />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#05060f" roughness={0.4} metalness={0.6} />
      </mesh>
    </group>
  );
}

/** إضاءة مشتركة لكل المشاهد */
export function StageLights({ key1 = "#ffffff", key2 = "#5b7bff" }: { key1?: string; key2?: string }) {
  return (
    <>
      <ambientLight intensity={0.45} />
      <hemisphereLight args={[key2, "#0b0a18", 0.7]} />
      <directionalLight position={[4, 8, 6]} intensity={1.6} color={key1} castShadow />
      <pointLight position={[-6, 3, 4]} intensity={30} color={key2} distance={24} />
    </>
  );
}
