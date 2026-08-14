import type { Landmark, Landmarks } from "./types";

/**
 * مرشّح One-Euro مبسّط: تنعيم قوي عند السكون، واستجابة شبه فورية عند الحركة السريعة.
 * يمنع اهتزاز النقاط دون إضافة تأخير محسوس.
 */
export class OneEuro {
  private prev: Landmarks | null = null;

  constructor(
    private minCutoff = 1.6,
    private beta = 12,
  ) {}

  reset() {
    this.prev = null;
  }

  filter(next: Landmarks, dt: number): Landmarks {
    if (!this.prev || this.prev.length !== next.length) {
      this.prev = next.map((p) => ({ ...p }));
      return this.prev;
    }
    const step = Math.max(dt, 1 / 120);
    const out: Landmarks = new Array(next.length);
    for (let i = 0; i < next.length; i++) {
      const n = next[i] as Landmark;
      const p = this.prev[i] as Landmark;
      const speed = Math.hypot(n.x - p.x, n.y - p.y) / step;
      const cutoff = this.minCutoff + this.beta * speed;
      const tau = 1 / (2 * Math.PI * cutoff);
      const a = 1 / (1 + tau / step);
      out[i] = {
        x: p.x + (n.x - p.x) * a,
        y: p.y + (n.y - p.y) * a,
        z: p.z + (n.z - p.z) * a,
        visibility: n.visibility ?? 1,
      };
    }
    this.prev = out;
    return out;
  }
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function clamp(v: number, lo = 0, hi = 1) {
  return v < lo ? lo : v > hi ? hi : v;
}
