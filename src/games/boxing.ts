import type { Frame, GameDef, GameInstance } from "@/engine/game";
import { audio } from "@/engine/audio";

type Pad = { x: number; y: number; side: "left" | "right"; life: number; max: number; r: number; hit: boolean };

function bg(f: Frame) {
  const { ctx, w, h, t } = f;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#1b0b1e");
  g.addColorStop(1, "#08060f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // حلبة ملاكمة بمنظور
  ctx.save();
  ctx.strokeStyle = "rgba(255,80,140,0.18)";
  ctx.lineWidth = 2;
  for (let i = 1; i <= 6; i++) {
    const y = h * (0.55 + (i / 6) * 0.45);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();
  const p = ctx.createRadialGradient(w / 2, h * 0.35, 10, w / 2, h * 0.35, h * 0.75);
  p.addColorStop(0, `rgba(255,120,180,${0.1 + Math.sin(t * 2) * 0.03})`);
  p.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = p;
  ctx.fillRect(0, 0, w, h);
}

function glove(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 24;
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.15, x, y, r);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.35, color);
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export const boxing: GameDef = {
  id: "boxing",
  title: "الملاكم",
  tagline: "الكم الأهداف قبل ما تختفي",
  howto: "ارفع يديك واضرب لكمة سريعة ناحية الدائرة المضيئة",
  duration: 70,
  accent: "#ff3d7f",
  accent2: "#ffb03a",
  emoji: "🥊",
  create(): GameInstance {
    const pads: Pad[] = [];
    let next = 0.8;

    return {
      step(f) {
        const { ctx, w, h, dt, input, events, vfx, score, diff } = f;
        bg(f);

        next -= dt * diff.rate;
        if (next <= 0) {
          next = 0.75 + Math.random() * 0.5;
          const side = Math.random() < 0.5 ? "left" : "right";
          const max = 1.5 / diff.speed;
          pads.push({
            side,
            x: side === "left" ? w * (0.18 + Math.random() * 0.16) : w * (0.66 + Math.random() * 0.16),
            y: h * (0.28 + Math.random() * 0.4),
            life: 0,
            max,
            r: Math.min(w, h) * 0.085,
            hit: false,
          });
        }

        const hands = {
          left: { x: input.handLeft.x * w, y: input.handLeft.y * h },
          right: { x: input.handRight.x * w, y: input.handRight.y * h },
        };

        const punches = events.filter((e) => e.type === "punchLeft" || e.type === "punchRight");

        for (let i = pads.length - 1; i >= 0; i--) {
          const p = pads[i]!;
          p.life += dt;
          if (p.life >= p.max) {
            pads.splice(i, 1);
            score.miss();
            audio.miss();
            vfx.floatText(p.x, p.y, "فات!", "#ff6b6b");
            continue;
          }
          for (const ev of punches) {
            const hand = ev.type === "punchLeft" ? hands.left : hands.right;
            if (Math.hypot(hand.x - p.x, hand.y - p.y) < p.r * 1.7) {
              const early = p.life < p.max * 0.55;
              score.hit(120, early ? "perfect" : "good");
              audio.hit(1 + ev.power);
              vfx.impact(p.x, p.y, early ? "#ffd166" : "#4dd7ff", 1 + ev.power);
              vfx.floatText(p.x, p.y - 20, early ? "ممتاز!" : "جيد", early ? "#ffd166" : "#4dd7ff");
              pads.splice(i, 1);
              break;
            }
          }
        }

        // رسم الأهداف
        for (const p of pads) {
          const k = 1 - p.life / p.max;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.strokeStyle = "rgba(255,255,255,0.25)";
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(0, 0, p.r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = p.side === "left" ? "#4dd7ff" : "#ff3d7f";
          ctx.shadowColor = ctx.strokeStyle;
          ctx.shadowBlur = 26;
          ctx.beginPath();
          ctx.arc(0, 0, p.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
          ctx.stroke();
          const g = ctx.createRadialGradient(0, 0, 2, 0, 0, p.r * 0.85);
          g.addColorStop(0, "rgba(255,255,255,0.65)");
          g.addColorStop(1, "rgba(255,255,255,0.05)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(0, 0, p.r * 0.85, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(10,5,15,0.85)";
          ctx.font = `900 ${p.r * 0.7}px system-ui`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(p.side === "left" ? "L" : "R", 0, 2);
          ctx.restore();
        }

        // مؤشرات القبضات (ليست صورة اللاعب — مجرد مؤشرات تحكّم)
        const rr = Math.min(w, h) * 0.045;
        glove(ctx, hands.left.x, hands.left.y, rr, "#4dd7ff");
        glove(ctx, hands.right.x, hands.right.y, rr, "#ff3d7f");
      },
    };
  },
};
