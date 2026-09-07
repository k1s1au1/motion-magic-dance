import type { Frame, GameDef, GameInstance } from "@/engine/game";
import { audio } from "@/engine/audio";

type Obs = { z: number; lane: -1 | 0 | 1; kind: "high" | "low" | "block"; scored: boolean };

const LANE_X = { "-1": 0.24, "0": 0.5, "1": 0.76 } as const;

function laneScreenX(lane: number, z: number, w: number) {
  const base = lane === -1 ? LANE_X["-1"] : lane === 1 ? LANE_X["1"] : LANE_X["0"];
  const spread = 0.5 + (1 - z) * 0.5;
  return w * (0.5 + (base - 0.5) * spread);
}

function horizonY(h: number) {
  return h * 0.34;
}
function zToY(z: number, h: number) {
  const hy = horizonY(h);
  return hy + (h * 0.98 - hy) * Math.pow(1 - z, 2.1);
}

export const dodge: GameDef = {
  id: "dodge",
  title: "ممر الهروب",
  tagline: "تنقّل، اقفز، وانخفض",
  howto: "تحرّك يمين/يسار بجسمك، اقفز فوق الحواجز الواطية، وانخفض تحت العوارض",
  duration: 80,
  accent: "#3ad1ff",
  accent2: "#a05bff",
  emoji: "🏃",
  create(): GameInstance {
    const obs: Obs[] = [];
    let next = 1.1;
    let lives = 3;
    let speed = 0.36;

    return {
      step(f) {
        const { ctx, w, h, dt, t, input, vfx, score, diff } = f;
        const hy = horizonY(h);

        // خلفية نفق
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "#070b18");
        g.addColorStop(0.34, "#101a33");
        g.addColorStop(1, "#05070f");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);

        // خطوط الأرضية بالمنظور
        ctx.strokeStyle = "rgba(90,190,255,0.22)";
        ctx.lineWidth = 2;
        for (const l of [-1, 0, 1]) {
          ctx.beginPath();
          ctx.moveTo(laneScreenX(l, 1, w), hy);
          ctx.lineTo(laneScreenX(l, 0, w), h);
          ctx.stroke();
        }
        for (let i = 0; i < 14; i++) {
          const z = ((i / 14 + ((t * speed * 0.9) % (1 / 14))) % 1);
          const y = zToY(z, h);
          const a = 0.05 + (1 - z) * 0.22;
          ctx.strokeStyle = `rgba(140,210,255,${a})`;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }

        speed = 0.34 * diff.speed + Math.min(0.3, t * 0.004);
        next -= dt * diff.rate;
        if (next <= 0) {
          next = 0.85 + Math.random() * 0.6;
          const lane = ([-1, 0, 1] as const)[Math.floor(Math.random() * 3)]!;
          const r = Math.random();
          obs.push({ z: 1, lane, kind: r < 0.38 ? "low" : r < 0.72 ? "high" : "block", scored: false });
        }

        const playerLane = input.lane;

        for (let i = obs.length - 1; i >= 0; i--) {
          const o = obs[i]!;
          o.z -= speed * dt;
          if (o.z <= -0.06) {
            obs.splice(i, 1);
            continue;
          }
          if (!o.scored && o.z <= 0.06) {
            o.scored = true;
            const same = o.lane === playerLane;
            const dodged =
              !same ||
              (o.kind === "low" && input.jump) ||
              (o.kind === "high" && input.squat);
            if (dodged) {
              score.hit(90, same ? "perfect" : "good");
              audio.good();
              vfx.floatText(laneScreenX(o.lane, 0, w), h * 0.7, same ? "مذهل!" : "+", "#8dffc8");
            } else {
              score.miss();
              lives--;
              audio.miss();
              vfx.screenFlash("255,60,80", 0.55);
              vfx.impact(laneScreenX(o.lane, 0, w), h * 0.8, "#ff4d6d", 1.4);
              if (lives <= 0) score.timeLeft = 0;
            }
          }
        }

        // رسم العوائق من البعيد للقريب
        for (const o of [...obs].sort((a, b) => b.z - a.z)) {
          const y = zToY(o.z, h);
          const s = (1 - o.z) ** 1.6;
          const x = laneScreenX(o.lane, o.z, w);
          const bw = w * 0.2 * (0.35 + s);
          const bh = h * 0.16 * (0.35 + s);
          ctx.save();
          if (o.kind === "low") {
            ctx.fillStyle = "#ffb703";
            ctx.shadowColor = "#ffb703";
            ctx.shadowBlur = 18;
            ctx.fillRect(x - bw / 2, y - bh * 0.42, bw, bh * 0.42);
            ctx.fillStyle = "rgba(0,0,0,0.55)";
            for (let k = 0; k < 5; k++) ctx.fillRect(x - bw / 2 + (k * bw) / 5, y - bh * 0.42, bw / 10, bh * 0.42);
          } else if (o.kind === "high") {
            ctx.fillStyle = "#a05bff";
            ctx.shadowColor = "#a05bff";
            ctx.shadowBlur = 22;
            ctx.fillRect(x - bw / 2, y - bh * 1.75, bw, bh * 0.4);
          } else {
            ctx.fillStyle = "#ff4d6d";
            ctx.shadowColor = "#ff4d6d";
            ctx.shadowBlur = 22;
            ctx.fillRect(x - bw / 2, y - bh * 1.3, bw, bh * 1.3);
            ctx.fillStyle = "rgba(255,255,255,0.18)";
            ctx.fillRect(x - bw / 2, y - bh * 1.3, bw, bh * 0.16);
          }
          ctx.restore();
        }

        // مؤشّر مسار اللاعب (بقعة ضوء أرضية فقط)
        const px = laneScreenX(playerLane, 0, w);
        const py = h * (input.jump ? 0.78 : 0.9);
        ctx.save();
        ctx.fillStyle = input.squat ? "rgba(255,209,102,0.9)" : "rgba(80,230,255,0.9)";
        ctx.shadowColor = ctx.fillStyle as string;
        ctx.shadowBlur = 30;
        ctx.beginPath();
        ctx.ellipse(px, py, w * 0.09, h * 0.018 * (input.squat ? 1.4 : 1), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // القلوب
        ctx.font = `${Math.round(h * 0.035)}px system-ui`;
        ctx.textAlign = "left";
        ctx.fillText("❤️".repeat(Math.max(0, lives)), w * 0.04, h * 0.12);
      },
    };
  },
};
