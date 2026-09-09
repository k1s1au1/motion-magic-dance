import * as THREE from "three";

export type Particle = {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  color: THREE.Color;
};

export type FloatText = { id: number; msg: string; color: string; life: number; x: number; y: number };

const MAX = 400;

/** نظام مؤثرات ثلاثي الأبعاد مشترك: جسيمات، حلقات صدمة، اهتزاز، وميض، نصوص طائرة */
export class Fx3D {
  particles: Particle[] = [];
  rings: { p: THREE.Vector3; r: number; max: number; life: number; color: THREE.Color }[] = [];
  texts: FloatText[] = [];
  shake = 0;
  flash = 0;
  flashColor = "255,255,255";
  private nextId = 1;

  burst(x: number, y: number, z: number, color: string, power = 1, count = 26) {
    const c = new THREE.Color(color);
    const n = Math.min(count, MAX - this.particles.length);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.5) * Math.PI;
      const s = (1.5 + Math.random() * 4) * power;
      this.particles.push({
        p: new THREE.Vector3(x, y, z),
        v: new THREE.Vector3(Math.cos(a) * Math.cos(b) * s, Math.sin(b) * s + 1, Math.sin(a) * Math.cos(b) * s * 0.5),
        life: 0,
        max: 0.5 + Math.random() * 0.5,
        size: (0.08 + Math.random() * 0.12) * power,
        color: c,
      });
    }
    this.rings.push({ p: new THREE.Vector3(x, y, z), r: 0.1, max: 1.6 * power, life: 0, color: c });
    this.shake = Math.min(1, this.shake + 0.22 * power);
  }

  ring(x: number, y: number, z: number, color: string, max = 1.4) {
    this.rings.push({ p: new THREE.Vector3(x, y, z), r: 0.1, max, life: 0, color: new THREE.Color(color) });
  }

  screenFlash(rgb: string, amount = 0.5) {
    this.flashColor = rgb;
    this.flash = Math.min(0.85, this.flash + amount);
  }

  /** نص طائر يُعرض في طبقة الواجهة (x,y في 0..1) */
  floatText(msg: string, color: string, x = 0.5, y = 0.45) {
    this.texts.push({ id: this.nextId++, msg, color, life: 0, x, y });
    if (this.texts.length > 12) this.texts.shift();
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life += dt;
      if (p.life > p.max) {
        this.particles.splice(i, 1);
        continue;
      }
      p.v.y -= 7 * dt;
      p.p.addScaledVector(p.v, dt);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]!;
      r.life += dt;
      r.r += dt * 6;
      if (r.r > r.max) this.rings.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]!;
      t.life += dt;
      if (t.life > 1) this.texts.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.flash = Math.max(0, this.flash - dt * 2.4);
  }
}
