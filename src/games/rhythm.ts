import type { Frame, GameDef, GameInstance } from "@/engine/game";
import { audio } from "@/engine/audio";

type Note = { lane: 0 | 1 | 2; y: number; hit: boolean };

const LANES = [0.22, 0.5, 0.78];

export const rhythm: GameDef = {
  id: "rhythm",
  title: "نبض الحركة",
  tagline: "اضرب النوتة على الخط",
  howto: "المسار الأيسر بيدك اليسرى، الأوسط بالقفز، والأيمن بيدك اليمنى — على الخط تماماً",
  duration: 75,
  accent: "#a05bff",
  accent2: "#3ad1ff",
  emoji: "🎵",
  create(): GameInstance {
    const notes: Note[] = [];
    let next = 0.8;
    let beat = 0;

    return {
      step(f) {
        const { ctx, w, h, dt, t, input, events, vfx, score, diff } = f;
        const hitY = h * 0.82;
        const speed = h * 0.42 * diff.speed;

        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "#150a2b");
        g.addColorStop(1, "#05040d");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);

        beat += dt;
        const pulse = Math.max(0, 1 - (beat % 0.46) * 3);
        for (let i = 0; i < 3; i++) {
          const x = LANES[i]! * w;
          const lw = w * 0.2;
          const lg = ctx.createLinearGradient(0, 0, 0, h);
          lg.addColorStop(0, "rgba(160,91,255,0.02)");
          lg.addColorStop(1, `rgba(160,91,255,${0.1 + pulse * 0.06})`);
          ctx.fillStyle = lg;
          ctx.fillRect(x - lw / 2, 0, lw, h);
        }
        ctx.fillStyle = `rgba(255,255,255,${0.5 + pulse * 0.4})`;
        ctx.shadowColor = "#3ad1ff";
        ctx.shadowBlur = 24;
        ctx.fillRect(0, hitY - 3, w, 6);
        ctx.shadowBlur = 0;

        next -= dt * diff.rate;
        if (next <= 0) {
          next = 0.55 + Math.random() * 0.35;
          notes.push({ lane: Math.floor(Math.random() * 3) as 0 | 1 | 2, y: -40, hit: false });
        }

        const jumped = events.some((e) => e.type === "jump");
        const hands = [
          { x: input.handLeft.x * w, y: input.handLeft.y * h },
          { x: input.handRight.x * w, y: input.handRight.y * h },
        ];

        for (let i = notes.length - 1; i >= 0; i--) {
          const n = notes[i]!;
          n.y += speed * dt;
          const d = Math.abs(n.y - hitY);
          const x = LANES[n.lane]! * w;
          if (!n.hit && d < h * 0.09) {
            const ok =
              n.lane === 1
                ? jumped || input.handsUp
                : hands.some(
                    (hd) => Math.abs(hd.x - x) < w * 0.14 && Math.abs(hd.y - hitY) < h * 0.14,
                  );
            if (ok) {
              n.hit = true;
              const perfect = d < h * 0.04;
              score.hit(110, perfect ? "perfect" : "good");
              if (perfect) audio.perfect();
              else audio.good();
              vfx.impact(x, hitY, perfect ? "#ffd166" : "#3ad1ff", perfect ? 1.4 : 1);
              vfx.floatText(x, hitY - 40, perfect ? "PERFECT" : "GOOD", perfect ? "#ffd166" : "#3ad1ff");
              notes.splice(i, 1);
              continue;
            }
          }
          if (n.y > hitY + h * 0.1) {
            notes.splice(i, 1);
            score.miss();
            audio.miss();
            vfx.floatText(x, hitY, "MISS", "#ff6b6b");
          }
        }

        for (const n of notes) {
          const x = LANES[n.lane]! * w;
          const r = Math.min(w, h) * 0.055;
          ctx.save();
          ctx.translate(x, n.y);
          ctx.rotate(Math.sin(t * 3 + n.y * 0.01) * 0.15);
          ctx.shadowColor = n.lane === 1 ? "#ffd166" : "#a05bff";
          ctx.shadowBlur = 28;
          const rg = ctx.createLinearGradient(-r, -r, r, r);
          rg.addColorStop(0, n.lane === 1 ? "#ffe29a" : "#c79bff");
          rg.addColorStop(1, n.lane === 1 ? "#ff9f1c" : "#5b2bd8");
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.roundRect(-r, -r * 0.7, r * 2, r * 1.4, r * 0.5);
          ctx.fill();
          ctx.fillStyle = "rgba(0,0,0,0.65)";
          ctx.font = `900 ${r}px system-ui`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(n.lane === 1 ? "▲" : n.lane === 0 ? "◀" : "▶", 0, 1);
          ctx.restore();
        }

        for (const hd of hands) {
          ctx.save();
          ctx.strokeStyle = "rgba(120,230,255,0.9)";
          ctx.shadowColor = "#3ad1ff";
          ctx.shadowBlur = 18;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(hd.x, hd.y, Math.min(w, h) * 0.03, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      },
    };
  },
};
