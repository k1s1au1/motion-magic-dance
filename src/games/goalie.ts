import type { Frame, GameDef, GameInstance } from "@/engine/game";
import { audio } from "@/engine/audio";

type Ball = { x: number; y: number; tx: number; ty: number; z: number; sp: number; done: boolean };

export const goalie: GameDef = {
  id: "goalie",
  title: "حارس المرمى",
  tagline: "صدّ الكرات بيديك",
  howto: "مدّ يديك ناحية الكرة قبل ما توصل الشبكة",
  duration: 70,
  accent: "#8dffc8",
  accent2: "#ffd166",
  emoji: "🧤",
  create(): GameInstance {
    const balls: Ball[] = [];
    let next = 1.2;
    let saves = 0;
    let goals = 0;

    return {
      step(f) {
        const { ctx, w, h, dt, input, vfx, score, diff } = f;

        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "#071a12");
        g.addColorStop(0.6, "#0d2d1e");
        g.addColorStop(1, "#061109");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);

        // المرمى
        const gx = w * 0.12,
          gy = h * 0.22,
          gw = w * 0.76,
          gh = h * 0.5;
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 8;
        ctx.strokeRect(gx, gy, gw, gh);
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1;
        for (let x = gx; x <= gx + gw; x += gw / 16) {
          ctx.beginPath();
          ctx.moveTo(x, gy);
          ctx.lineTo(x, gy + gh);
          ctx.stroke();
        }
        for (let y = gy; y <= gy + gh; y += gh / 10) {
          ctx.beginPath();
          ctx.moveTo(gx, y);
          ctx.lineTo(gx + gw, y);
          ctx.stroke();
        }
        ctx.restore();

        next -= dt * diff.rate;
        if (next <= 0) {
          next = 1.15 + Math.random() * 0.6;
          balls.push({
            x: w * 0.5,
            y: h * 0.3,
            tx: gx + gw * (0.12 + Math.random() * 0.76),
            ty: gy + gh * (0.15 + Math.random() * 0.75),
            z: 1,
            sp: (0.42 + Math.random() * 0.2) * diff.speed,
            done: false,
          });
        }

        const hands = [
          { x: input.handLeft.x * w, y: input.handLeft.y * h },
          { x: input.handRight.x * w, y: input.handRight.y * h },
        ];

        for (let i = balls.length - 1; i >= 0; i--) {
          const b = balls[i]!;
          b.z -= b.sp * dt;
          const k = 1 - b.z;
          const bx = w * 0.5 + (b.tx - w * 0.5) * k;
          const by = h * 0.3 + (b.ty - h * 0.3) * k;
          const r = Math.min(w, h) * (0.015 + 0.06 * k);
          b.x = bx;
          b.y = by;

          if (!b.done && b.z < 0.24) {
            const caught = hands.some((hd) => Math.hypot(hd.x - bx, hd.y - by) < r + Math.min(w, h) * 0.06);
            if (caught) {
              b.done = true;
              saves++;
              score.hit(140, b.z < 0.12 ? "perfect" : "good");
              audio.hit(1.2);
              vfx.impact(bx, by, "#8dffc8", 1.3);
              vfx.floatText(bx, by - 30, "صدّة!", "#8dffc8");
              balls.splice(i, 1);
              continue;
            }
          }
          if (b.z <= 0) {
            goals++;
            score.miss();
            audio.miss();
            vfx.screenFlash("255,60,80", 0.5);
            vfx.floatText(bx, by, "هدف عليك!", "#ff6b6b");
            balls.splice(i, 1);
          }
        }

        for (const b of balls) {
          const k = 1 - b.z;
          const r = Math.min(w, h) * (0.015 + 0.06 * k);
          ctx.save();
          ctx.shadowColor = "rgba(0,0,0,0.6)";
          ctx.shadowBlur = 20;
          const rg = ctx.createRadialGradient(b.x - r * 0.35, b.y - r * 0.4, r * 0.1, b.x, b.y, r);
          rg.addColorStop(0, "#ffffff");
          rg.addColorStop(0.7, "#e8e8e8");
          rg.addColorStop(1, "#8c8c8c");
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(20,20,20,0.85)";
          for (let a = 0; a < 5; a++) {
            const ang = (a / 5) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(b.x + Math.cos(ang) * r * 0.55, b.y + Math.sin(ang) * r * 0.55, r * 0.18, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        for (const hd of hands) {
          ctx.save();
          ctx.fillStyle = "rgba(255,209,102,0.9)";
          ctx.shadowColor = "#ffd166";
          ctx.shadowBlur = 24;
          ctx.beginPath();
          ctx.arc(hd.x, hd.y, Math.min(w, h) * 0.05, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.font = `700 ${Math.round(h * 0.03)}px system-ui`;
        ctx.textAlign = "center";
        ctx.fillText(`صدّات ${saves} · أهداف ${goals}`, w / 2, h * 0.95);
      },
    };
  },
};
