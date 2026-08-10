import { useCallback, useEffect, useRef, useState } from "react";
import GameStage, { KidHud } from "./GameStage";
import { mirrored, usePoseCamera, type FrameInfo } from "@/lib/usePoseCamera";
import { L } from "@/lib/dance";
import { audio } from "@/lib/audioUtils";
import DifficultyPicker from "./DifficultyPicker";
import { useDifficulty } from "@/lib/difficulty";
import { createCalibrator, makeSmoother } from "@/lib/calibration";
import { airDust, drawSphere, glow, vignette } from "@/lib/gfx";

type Fruit = {
  x: number; y: number; vx: number; vy: number; r: number;
  rot: number; spin: number; kind: number; bomb: boolean; sliced: boolean;
};
type Piece = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number };

const FRUITS = [
  { emoji: "🍉", color: "#ff5b6e" },
  { emoji: "🍊", color: "#ffa62b" },
  { emoji: "🍏", color: "#8ce06a" },
  { emoji: "🍇", color: "#a566ff" },
  { emoji: "🍍", color: "#ffd23f" },
];

const GAME_MS = 60000;

export default function FruitNinja({ onBack }: { onBack: () => void }) {
  const { diff, id: diffId, select } = useDifficulty();
  const diffRef = useRef(diff);
  diffRef.current = diff;
  const cal = useRef(createCalibrator({ holdSeconds: 1.4 }));
  const smoothA = useRef(makeSmoother(0.55));
  const smoothB = useRef(makeSmoother(0.55));
  const [calib, setCalib] = useState({ progress: 0, steady: false });
  const [phase, setPhase] = useState<"idle" | "calibrating" | "playing" | "finished">("idle");
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const phaseRef = useRef<"idle" | "calibrating" | "playing" | "finished">("idle");
  const fruits = useRef<Fruit[]>([]);
  const pieces = useRef<Piece[]>([]);
  const trails = useRef<{ x: number; y: number; life: number }[][]>([[], []]);
  const spawnAt = useRef(0);
  const endAt = useRef(0);
  const calibTimer = useRef(0);
  const comboRef = useRef(0);
  const lastSlice = useRef(0);
  const flash = useRef(0);

  const burst = (x: number, y: number, color: string, n = 18) => {
    for (let i = 0; i < n; i++) {
      pieces.current.push({
        x, y, vx: (Math.random() - 0.5) * 14, vy: (Math.random() - 0.5) * 14,
        life: 1, color, size: Math.random() * 7 + 3,
      });
    }
  };

  const onFrame = useCallback(({ lm, ctx, w, h, dt, now, visible: poseOk }: FrameInfo) => {
    const isCalibrating = phaseRef.current === "calibrating";
    const isPlaying = phaseRef.current === "playing";

    const d = diffRef.current;

    // خلفية مطبخ خشبي بإضاءة علوية
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#3a2517");
    bg.addColorStop(0.5, "#24150d");
    bg.addColorStop(1, "#0e0704");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    glow(ctx, w * 0.5, -h * 0.1, w * 1.1, "#ffcf8a", 0.22);
    ctx.save();
    for (let i = 0; i < 14; i++) {
      const y = (i / 14) * h;
      ctx.fillStyle = i % 2 ? "rgba(255,220,180,0.028)" : "rgba(0,0,0,0.05)";
      ctx.fillRect(0, y, w, h / 14);
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.restore();
    airDust(ctx, w, h, now, "255,220,170");

    cal.current.setTolerance(d.tolerance);
    const st = cal.current.update(lm, dt, isCalibrating, poseOk);
    if (isCalibrating) {
      setCalib({ progress: st.progress, steady: st.steady });
      if (st.ready) startPlaying();
    }

    if (isPlaying) {
      setTimeLeft(Math.max(0, Math.ceil((endAt.current - now) / 1000)));
      if (now >= endAt.current) {
        phaseRef.current = "finished";
        setPhase("finished");
        audio.stopMusic();
        audio.speak("انتهى الوقت! أحسنت", { force: true });
      }
      if (now >= spawnAt.current) {
        spawnAt.current = now + (650 + Math.random() * 500) * d.spawn;
        const count = 1 + (Math.random() < 0.3 ? 1 : 0);
        for (let i = 0; i < count; i++) {
          const fromLeft = Math.random() < 0.5;
          fruits.current.push({
            x: fromLeft ? 0.1 + Math.random() * 0.2 : 0.7 + Math.random() * 0.2,
            y: 1.15,
            vx: (fromLeft ? 1 : -1) * (0.05 + Math.random() * 0.12) * d.speed,
            vy: -(0.85 + Math.random() * 0.22) * d.speed,
            r: 0.075,
            rot: 0,
            spin: (Math.random() - 0.5) * 6,
            kind: Math.floor(Math.random() * FRUITS.length),
            bomb: Math.random() < 0.16,
            sliced: false,
          });
        }
      }
    }

    // مسار اليدين (السيوف)
    const hands = [smoothA.current(mirrored(lm?.[L.rWrist])), smoothB.current(mirrored(lm?.[L.lWrist]))];
    hands.forEach((hnd, i) => {
      const t = trails.current[i]!;
      if (hnd) t.push({ x: hnd.x, y: hnd.y, life: 1 });
      if (t.length > 14) t.shift();
      t.forEach((p) => (p.life -= 0.06));
      trails.current[i] = t.filter((p) => p.life > 0);
    });

    // فيزياء وتقطيع
    fruits.current = fruits.current.filter((f) => {
      f.vy += 0.95 * d.speed * d.speed * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.spin * dt;

      if (isPlaying && !f.sliced) {
        for (const hnd of hands) {
          if (!hnd) continue;
          if (Math.hypot(hnd.x - f.x, (hnd.y - f.y) * (h / w)) < f.r * d.tolerance) {
            f.sliced = true;
            if (f.bomb) {
              comboRef.current = 0;
              setCombo(0);
              setScore((s) => Math.max(0, s - 200));
              audio.playFail();
              audio.speak("قنبلة! انتبه", { cooldown: 1800 });
              burst(f.x * w, f.y * h, "#ff3b3b", 30);
              flash.current = 0.6;
            } else {
              const chain = now - lastSlice.current < 700;
              comboRef.current = chain ? comboRef.current + 1 : 1;
              lastSlice.current = now;
              setCombo(comboRef.current);
              setScore((s) => s + 100 * Math.max(1, comboRef.current));
              audio.playPop();
              if (comboRef.current >= 3) audio.speak("كومبو رائع!", { cooldown: 2500 });
              else audio.speak("قطعتها!", { cooldown: 2600 });
              burst(f.x * w, f.y * h, FRUITS[f.kind]!.color, 22);
              flash.current = 0.25;
            }
            return false;
          }
        }
      }
      return f.y < 1.35;
    });

    // رسم الفواكه
    fruits.current.forEach((f) => {
      const px = f.x * w, py = f.y * h, r = f.r * w;
      if (f.bomb) glow(ctx, px, py, r * 2.2, "#ff2a2a", 0.4);
      else drawSphere(ctx, px, py, r * 0.92, FRUITS[f.kind]!.color, { glow: FRUITS[f.kind]!.color });
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(f.rot);
      ctx.globalAlpha = f.bomb ? 1 : 0.95;
      ctx.shadowBlur = 18;
      ctx.shadowColor = f.bomb ? "#ff2222" : FRUITS[f.kind]!.color;
      ctx.font = `${r * 1.85}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(f.bomb ? "💣" : FRUITS[f.kind]!.emoji, 0, 0);
      ctx.restore();
    });

    // شظايا
    pieces.current.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.5;
      p.life -= 0.025;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 12;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    pieces.current = pieces.current.filter((p) => p.life > 0);

    // شفرات اليدين
    trails.current.forEach((t, i) => {
      if (t.length < 2) return;
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = i === 0 ? "rgba(120,255,255,0.9)" : "rgba(255,180,120,0.9)";
      ctx.shadowBlur = 20;
      ctx.shadowColor = ctx.strokeStyle as string;
      for (let k = 1; k < t.length; k++) {
        const a = t[k - 1]!, b = t[k]!;
        ctx.globalAlpha = b.life;
        ctx.lineWidth = b.life * w * 0.03;
        ctx.beginPath();
        ctx.moveTo(a.x * w, a.y * h);
        ctx.lineTo(b.x * w, b.y * h);
        ctx.stroke();
      }
      ctx.restore();
    });

    vignette(ctx, w, h, 0.5);

    flash.current *= 0.88;
    if (flash.current > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${flash.current})`;
      ctx.fillRect(0, 0, w, h);
    }
  }, []);

  const { videoRef, canvasRef, start, status, error, visible } = usePoseCamera((f) => onFrame(f), "rgba(255,200,120,0.3)");

  useEffect(() => () => { audio.stopMusic(); audio.stopSpeech(); }, []);

  const play = async () => {
    calibTimer.current = 0;
    cal.current.reset();
    setCalib({ progress: 0, steady: false });
    await start();
    phaseRef.current = "calibrating";
    setPhase("calibrating");
    audio.speak("قف ثابت حتى نضبط حركاتك", { force: true });
  };

  const startPlaying = () => {
    if (phaseRef.current === "playing") return;
    fruits.current = [];
    pieces.current = [];
    comboRef.current = 0;
    setScore(0);
    setCombo(0);
    setTimeLeft(60);
    spawnAt.current = performance.now();
    endAt.current = performance.now() + GAME_MS;
    phaseRef.current = "playing";
    setPhase("playing");
    audio.startKidsMusic(diffRef.current.bpm);
    audio.speak("قطّع الفواكه بيديك!", { force: true });
  };

  return (
    <GameStage
      videoRef={videoRef} canvasRef={canvasRef} title="نينجا الفواكه" emoji="🍉" onBack={onBack}
      isCalibrating={phase === "calibrating"}
      isPoseVisible={visible}
      calibProgress={calib.progress}
      isSteady={calib.steady}
      hud={phase === "playing" ? (
        <>
          <KidHud label="النقاط" value={score.toLocaleString("ar-EG")} />
          <KidHud label="كومبو" value={`×${Math.max(1, combo)}`} />
          <KidHud label="الوقت" value={`${timeLeft}ث`} />
        </>
      ) : null}
    >
      {phase === "idle" && (
        <div className="text-center">
          <h2 className="kid-title text-3xl font-black">نينجا الفواكه 🍉🥷</h2>
          <p className="mt-2 text-sm text-muted-foreground">لوّح بيديك لتقطيع الفواكه الطائرة، وابتعد عن القنابل!</p>
          <DifficultyPicker value={diffId} onChange={select} />
          {error && <p className="mt-2 text-xs text-red-400 font-bold">{error}</p>}
          <button onClick={play} disabled={status === "loading"} className="btn-kid mt-5 w-full shadow-2xl">
            {status === "loading" ? "نجهّز السيوف…" : "ابدأ التقطيع! ⚔️"}
          </button>
        </div>
      )}
      {phase === "finished" && (
        <div className="text-center">
          <h2 className="kid-title text-4xl">نينجا محترف! 🥷</h2>
          <p className="mt-2 text-2xl font-bold text-orange-400">{score.toLocaleString("ar-EG")} نقطة</p>
          <DifficultyPicker value={diffId} onChange={select} />
          <button onClick={play} className="btn-kid mt-5 w-full">جولة جديدة 🔁</button>
        </div>
      )}
    </GameStage>
  );
}
