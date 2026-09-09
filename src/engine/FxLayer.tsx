import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Fx3D } from "./fx3d";

const MAX_P = 400;
const MAX_R = 24;
const dummy = new THREE.Object3D();

/** يرسم جسيمات وحلقات الصدمة بكفاءة عبر InstancedMesh */
export function FxLayer({ fx }: { fx: Fx3D }) {
  const pRef = useRef<THREE.InstancedMesh>(null);
  const rRef = useRef<THREE.InstancedMesh>(null);
  const colors = useMemo(() => new Float32Array(MAX_P * 3), []);
  const rColors = useMemo(() => new Float32Array(MAX_R * 3), []);

  useFrame(() => {
    const pm = pRef.current;
    if (pm) {
      for (let i = 0; i < MAX_P; i++) {
        const p = fx.particles[i];
        if (p) {
          const k = 1 - p.life / p.max;
          dummy.position.copy(p.p);
          dummy.scale.setScalar(Math.max(0.001, p.size * k));
          dummy.rotation.set(p.life * 4, p.life * 3, 0);
          colors[i * 3] = p.color.r;
          colors[i * 3 + 1] = p.color.g;
          colors[i * 3 + 2] = p.color.b;
        } else {
          dummy.position.set(0, -999, 0);
          dummy.scale.setScalar(0.001);
        }
        dummy.updateMatrix();
        pm.setMatrixAt(i, dummy.matrix);
      }
      pm.instanceMatrix.needsUpdate = true;
      if (pm.geometry.attributes.color) (pm.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }

    const rm = rRef.current;
    if (rm) {
      for (let i = 0; i < MAX_R; i++) {
        const r = fx.rings[i];
        if (r) {
          dummy.position.copy(r.p);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(Math.max(0.001, r.r));
          rColors[i * 3] = r.color.r;
          rColors[i * 3 + 1] = r.color.g;
          rColors[i * 3 + 2] = r.color.b;
        } else {
          dummy.position.set(0, -999, 0);
          dummy.scale.setScalar(0.001);
        }
        dummy.updateMatrix();
        rm.setMatrixAt(i, dummy.matrix);
      }
      rm.instanceMatrix.needsUpdate = true;
      if (rm.geometry.attributes.color) (rm.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh ref={pRef} args={[undefined, undefined, MAX_P]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 0]}>
          <instancedBufferAttribute attach="attributes-color" args={[colors, 3]} />
        </icosahedronGeometry>
        <meshBasicMaterial vertexColors toneMapped={false} transparent opacity={0.95} />
      </instancedMesh>
      <instancedMesh ref={rRef} args={[undefined, undefined, MAX_R]} frustumCulled={false}>
        <torusGeometry args={[1, 0.06, 8, 40]}>
          <instancedBufferAttribute attach="attributes-color" args={[rColors, 3]} />
        </torusGeometry>
        <meshBasicMaterial vertexColors toneMapped={false} transparent opacity={0.5} />
      </instancedMesh>
    </group>
  );
}
