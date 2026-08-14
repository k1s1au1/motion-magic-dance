export type Particle = {
  x: number; y: number; vx: number; vy: number; life: number; max: number;
  size: number; color: string; kind: "spark" | "ring" | "text" | "trail";
  text?: string; grav: number;
};

/** نظام مؤثرات بصرية مشترك: جسيمات، حلقات صدمة، نص طائر، اهتزاز الشاشة */
export class Vfx {
  particles: Particle[] = [];
  shake = 0;
  flash = 0;
  flashColor = "255,255,255";

  burst(x: number, y: number, color: string, count = 18, power = 1) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (60 + Math.random() * 320) * power;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0, max: 0.4 + Math.random() * 0.5,
        size: 2 + Math.random() * 5 * power, color, kind: "spark", grav: 420,
      });
    }
  }

  ring(x: number, y: number, color: string, size = 60) {
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0, max: 0.45, size, color, kind: "ring", grav: 0 });
  }

  floatText(x: number, y: number, text: string, color: string) {
    this.particles.push({ x, y, vx: 0, vy: -90, life: 0, max: 0.9, size: 30, color, kind: "text", text, grav: 0 });
  }

  trail(x: number, y: number, color: string, size = 14) {
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0, max: 0.35, size, color, kind: "trail", grav: 0 });
  }

  impact(x: number, y: number, color: string, power = 1) {
    this.burst(x, y, color, 22, power);
    this.ring(x, y, color, 40 + power * 50);
    this.shake = Math.min(22, this.shake + 8 * power);
  }

  screenFlash(color: string, amount = 0.5) {
    this.flashColor = color;
    this.flash = Math.max(this.flash, amount);
  }

  update(dt: number) {
    this.shake *= Math.pow(0.02, dt);
    this.flash *= Math.pow(0.01, dt);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life += dt;
      if (p.life >= p.max) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
      p.vx *= 1 - 1.6 * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    for (const p of this.particles) {
      const t = p.life / p.max;
      const alpha = 1 - t;
      ctx.globalAlpha = alpha;
      if (p.kind === "spark" || p.kind === "trail") {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (p.kind === "trail" ? 1 - t : 1), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "ring") {
        ctx.strokeStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 24;
        ctx.lineWidth = 6 * (1 - t) + 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + t * 1.6), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === "text") {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 20;
        ctx.font = `900 ${p.size * (1 + t * 0.3)}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(p.text ?? "", p.x, p.y);
      }
    }
    ctx.restore();
  }

  drawFlash(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (this.flash <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = Math.min(0.6, this.flash);
    ctx.fillStyle = `rgb(${this.flashColor})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  shakeOffset() {
    const s = this.shake;
    return { x: (Math.random() - 0.5) * s, y: (Math.random() - 0.5) * s };
  }

  reset() {
    this.particles = [];
    this.shake = 0;
    this.flash = 0;
  }
}
