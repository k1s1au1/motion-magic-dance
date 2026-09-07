import type { Frame, GameDef, GameInstance } from "@/engine/game";
import { audio } from "@/engine/audio";

type Orb = { x: number; y: number; vx: number; vy: number; r: number; bomb: boolean; life: number };

export const target: GameDef = {
  id: "target",
  title: "كاسر الفقاعات",
  tagline: "حطّم الفقاعات وتجنّب القنابل",
  howto: "حرّك يديك بسرعة فوق الفقاعات لتحطيمها، وابتعد عن الكرات الحمراء",
  duration: 70,
  accent: "#2ee6a8",
  accent2: "#3ad1ff",
  emoji: "🫧",
  create(): GameInstance {
    const orbs: Orb[] = [];
    let next = 0.5;

    return {
      step(f) {
        const { ctx, w, h, dt, t, input, vfx, score, diff } = f;

        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, "#04121a");
        g.addColorStop(1, "#0b0722");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 30; i++) {
          const x = ((i * 137.5) % w) + Math.sin(t * 0.3 + i) * 12;
          const y = (h - (((t * 22 * (0.4 + (i % 5) / 6)) + i * 97) % (h + 60)));
          ctx.fillStyle = `rgba(120,220,255,${0.05 + (i % 4) * 0.02})`;
          ctx.beginPath();
          ctx.arc(x, y, 2 + (i % 4), 0, Math.PI * 2);
          ctx.fill();
        }

        next -= dt * diff.rate;
        if (next <= 0) {
          next = 0.45 + Math.random() * 0.4;
          const bomb = Math.random() < 0.18;
          const r = Math.min(w, h) * (bomb ? 0.055 : 0.05 + Math.random() * 0.03);
          orbs.push({
            x: w * (0.12 + Math.random() * 0.76),
            y: h * 1.05,
            vx: (Math.random() - 0.5) * w * 0.08,
            vy: -h * (0.34 + Math.random() * 0.14) * diff.speed,
            r,
            bomb,
            life: 0,
          });
        }

        const hands = [
          { x: input.handLeft.x * w, y: input.handLeft.y * h, v: Math.hypot(input.handLeftVel.x, input.handLeftVel.y), c: "#3ad1ff" },
          { x: input.handRight.x * w, y: input.handRight.y * h, v: Math.hypot(input.handRightVel.x, input.handRightVel.y), c: "#ff5fa2" },
        ];
        for (const hd of hands) vfx.trail(hd.x, hd.y, hd.c, 16);

        for (let i = orbs.length - 1; i >= 0; i--) {
          const o = orbs[i]!;
          o.life += dt;
          o.x += o.vx * dt;
          o.y += o.vy * dt;
          o.vy += h * 0.28 * dt;
          if (o.y > h * 1.2) {
            orbs.splice(i, 1);
            if (!o.bomb) score.miss();
            continue;
          }
          let popped = false;
          for (const hd of hands) {
            if (Math.hypot(hd.x - o.x, hd.y - o.y) < o.r + Math.min(w, h) * 0.035 && hd.v > 0.5) {
              popped = true;
              break;
            }
          }
          if (!popped) continue;
          orbs.splice(i, 1);
          if (o.bomb) {
            score.miss();
            score.points = Math.max(0, score.points - 150);
            audio.miss();
            vfx.screenFlash("255,60,60", 0.6);
            vfx.impact(o.x, o.y, "#ff4d4d", 1.6);
            vfx.floatText(o.x, o.y - 30, "قنبلة!", "#ff4d4d");
          } else {
            score.hit(100, o.r < Math.min(w, h) * 0.06 ? "perfect" : "good");
            audio.perfect();
            vfx.impact(o.x, o.y, "#2ee6a8", 1);
            vfx.floatText(o.x, o.y - 24, `+${score.combo}x`, "#8dffc8");
          }
        }

        for (const o of orbs) {
          ctx.save();
          ctx.shadowColor = o.bomb ? "#ff3b3b" : "#2ee6a8";
          ctx.shadowBlur = 26;
          const rg = ctx.createRadialGradient(o.x - o.r * 0.3, o.y - o.r * 0.35, o.r * 0.1, o.x, o.y, o.r);
          if (o.bomb) {
            rg.addColorStop(0, "rgba(255,190,190,0.95)");
            rg.addColorStop(0.5, "#e01b1b");
            rg.addColorStop(1, "rgba(60,0,0,0.9)");
          } else {
            rg.addColorStop(0, "rgba(255,255,255,0.9)");
            rg.addColorStop(0.45, "rgba(70,240,190,0.75)");
            rg.addColorStop(1, "rgba(20,90,120,0.35)");
          }
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
          ctx.fill();
          if (o.bomb) {
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            ctx.font = `900 ${o.r}px system-ui`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("!", o.x, o.y + 2);
          }
          ctx.restore();
        }

        for (const hd of hands) {
          ctx.save();
          ctx.strokeStyle = hd.c;
          ctx.shadowColor = hd.c;
          ctx.shadowBlur = 20;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(hd.x, hd.y, Math.min(w, h) * 0.035, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      },
    };
  },
};
