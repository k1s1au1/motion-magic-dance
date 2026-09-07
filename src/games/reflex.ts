import type { Frame, GameDef, GameInstance } from "@/engine/game";
import type { MotionEventType } from "@/motion/types";
import { audio } from "@/engine/audio";

type Cmd = { type: MotionEventType; label: string; icon: string; say: string };

const CMDS: Cmd[] = [
  { type: "moveLeft", label: "يسار", icon: "◀", say: "يسار" },
  { type: "moveRight", label: "يمين", icon: "▶", say: "يمين" },
  { type: "jump", label: "اقفز", icon: "▲", say: "اقفز" },
  { type: "squat", label: "انخفض", icon: "▼", say: "انخفض" },
  { type: "handsUp", label: "ارفع يديك", icon: "✚", say: "ارفع يديك" },
  { type: "punchLeft", label: "لكمة يسار", icon: "🥊", say: "لكمة يسار" },
  { type: "punchRight", label: "لكمة يمين", icon: "🥊", say: "لكمة يمين" },
];

export const reflex: GameDef = {
  id: "reflex",
  title: "رد الفعل",
  tagline: "نفّذ الأمر بأسرع وقت",
  howto: "اقرأ الأمر على الشاشة ونفّذه بجسمك قبل انتهاء الشريط",
  duration: 65,
  accent: "#ffd166",
  accent2: "#ff5fa2",
  emoji: "⚡",
  create(): GameInstance {
    let cmd: Cmd | null = null;
    let timer = 0;
    let limit = 2;
    let rest = 0.6;
    let flashOk = 0;

    return {
      step(f) {
        const { ctx, w, h, dt, t, events, vfx, score, diff } = f;

        const g = ctx.createRadialGradient(w / 2, h * 0.45, 20, w / 2, h * 0.45, Math.max(w, h) * 0.8);
        g.addColorStop(0, "#241634");
        g.addColorStop(1, "#06050d");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 1;
        for (let i = 0; i < 10; i++) {
          const r = ((t * 90 + i * 60) % (Math.max(w, h) * 0.8));
          ctx.beginPath();
          ctx.arc(w / 2, h * 0.45, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();

        if (!cmd) {
          rest -= dt;
          if (rest <= 0) {
            cmd = CMDS[Math.floor(Math.random() * CMDS.length)]!;
            limit = (1.9 * diff.window);
            timer = 0;
            audio.say(cmd.say);
            audio.count(1);
          }
        } else {
          timer += dt;
          const done = events.some((e) => e.type === cmd!.type);
          if (done) {
            const fast = timer < limit * 0.4;
            score.hit(130, fast ? "perfect" : "good");
            audio.perfect();
            vfx.screenFlash("140,255,190", 0.35);
            vfx.floatText(w / 2, h * 0.62, fast ? "سريع جداً!" : "أحسنت", "#8dffc8");
            flashOk = 0.5;
            cmd = null;
            rest = 0.45 / diff.rate;
          } else if (timer >= limit) {
            score.miss();
            audio.miss();
            vfx.screenFlash("255,70,70", 0.4);
            vfx.floatText(w / 2, h * 0.62, "متأخر!", "#ff6b6b");
            cmd = null;
            rest = 0.5 / diff.rate;
          }
        }

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (cmd) {
          const k = 1 - timer / limit;
          const pulse = 1 + Math.sin(t * 12) * 0.03;
          ctx.save();
          ctx.translate(w / 2, h * 0.44);
          ctx.scale(pulse, pulse);
          ctx.shadowColor = "#ffd166";
          ctx.shadowBlur = 40;
          ctx.fillStyle = "#ffd166";
          ctx.font = `900 ${Math.round(Math.min(w, h) * 0.22)}px system-ui`;
          ctx.fillText(cmd.icon, 0, -Math.min(w, h) * 0.08);
          ctx.fillStyle = "#fff";
          ctx.font = `900 ${Math.round(Math.min(w, h) * 0.11)}px system-ui`;
          ctx.fillText(cmd.label, 0, Math.min(w, h) * 0.1);
          ctx.restore();

          const bw = w * 0.6;
          ctx.fillStyle = "rgba(255,255,255,0.12)";
          ctx.fillRect(w / 2 - bw / 2, h * 0.72, bw, 14);
          ctx.fillStyle = k > 0.4 ? "#2ee6a8" : "#ff4d6d";
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = 20;
          ctx.fillRect(w / 2 - bw / 2, h * 0.72, bw * Math.max(0, k), 14);
          ctx.shadowBlur = 0;
        } else if (flashOk > 0) {
          flashOk -= dt;
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.font = `900 ${Math.round(Math.min(w, h) * 0.09)}px system-ui`;
          ctx.fillText("استعد…", w / 2, h * 0.45);
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.font = `700 ${Math.round(Math.min(w, h) * 0.06)}px system-ui`;
          ctx.fillText("استعد للأمر التالي", w / 2, h * 0.45);
        }
      },
    };
  },
};
