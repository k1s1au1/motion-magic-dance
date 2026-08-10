import { useCallback, useEffect, useRef, useState } from "react";
import GameStage, { KidHud } from "./GameStage";
import DifficultyPicker from "./DifficultyPicker";
import { mirrored, usePoseCamera, type FrameInfo } from "@/lib/usePoseCamera";
import { L } from "@/lib/dance";
import { audio } from "@/lib/audioUtils";
import { useDifficulty } from "@/lib/difficulty";
import { createCalibrator } from "@/lib/calibration";
import { airDust, glow, neonBeam, vignette, withAlpha } from "@/lib/gfx";

type Laser = { y: number; vy: number; kind: "high" | "low"; hinted: boolean; scored: boolean };
type Spark = { x: number; y: number; vx: number; vy: number; life: number };

const MAX_LIVES = 3;

export default function LaserDodge({ onBack }: { onBack: () => void }) {
  const { diff, id: diffId, select } = useDifficulty();
  const diffRef = useRef(diff);
  diffRef.current = diff;

  const [phase, setPhase] = useState<"idle" | "calibrating" | "playing" | "finished">("idle");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [level, setLevel] = useState(1);
  const [calib, setCalib] = useState({ progress: 0, steady: false });
  const phaseRef = useRef<"idle" | "calibrating" | "playing" | "finished">("idle");
  const lasers = useRef<Laser[]>([]);
  const sparks = useRef<Spark[]>([]);
  const spawnAt = useRef(0);
  const livesRef = useRef(MAX_LIVES);
  const scoreRef = useRef(0);
  const invuln = useRef(0);
  const flash = useRef(0);
  const cal = useRef(createCalibrator({ holdSeconds: 1.6 }));

  const onFrame = useCallback(({ lm, ctx, w, h, dt, now, visible: poseOk }: FrameInfo) => {
    const isCalibrating = phaseRef.current === "calibrating";
    const isPlaying = phaseRef.current === "playing";
    const d = diffRef.current;

    // خلفية معمل ليزر بعمق ومنظور
    const bg = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.5, w * 1.1);
    bg.addColorStop(0, "#1b0d33");
    bg.addColorStop(0.6, "#0c0619");
    bg.addColorStop(1, "#03020a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.strokeStyle = "rgba(150,90,255,0.10)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      ctx.beginPath();
      ctx.moveTo(t * w, h);
      ctx.lineTo(w * 0.5 + (t - 0.5) * w * 0.25, h * 0.38);
      ctx.stroke();
    }
    for (let i = 1; i < 9; i++) {
      const y = h * 0.38 + Math.pow(i / 9, 2.2) * h * 0.62;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
    airDust(ctx, w, h, now, "200,150,255");

    const c = cal.current;
    c.setTolerance(d.tolerance);
    const st = c.update(lm, dt, isCalibrating, poseOk);

    if (isCalibrating) {
      setCalib({ progress: st.progress, steady: st.steady });
      if (st.ready) startPlaying();
    }

    const isJumping = st.jumping;
    const isDucking = st.ducking;

    if (isPlaying && now >= spawnAt.current) {
      const lvl = 1 + Math.floor(scoreRef.current / 800);
      setLevel(lvl);
      spawnAt.current = now + Math.max(750, (1900 - lvl * 130) * d.spawn);
      const kind: "high" | "low" = Math.random() < 0.5 ? "high" : "low";
      lasers.current.push({ y: -0.1, vy: (0.35 + lvl * 0.04) * d.speed, kind, hinted: false, scored: false });
    }

    invuln.current = Math.max(0, invuln.current - dt);

    lasers.current = lasers.current.filter((lz) => {
      lz.y += lz.vy * dt;

      if (isPlaying && !lz.hinted && lz.y > 0.22) {
        lz.hinted = true;
        audio.speak(lz.kind === "low" ? "اقفز!" : "انخفض!", { cooldown: 800 });
      }

      // نطاق التصادم عند وسط الشاشة
      if (isPlaying && !lz.scored && lz.y > 0.55 && lz.y < 0.72) {
        const safe = lz.kind === "low" ? isJumping : isDucking;
        if (!safe && invuln.current <= 0) {
          lz.scored = true;
          invuln.current = 1.2;
          livesRef.current -= 1;
          setLives(livesRef.current);
          audio.playFail();
          audio.speak("احترس!", { cooldown: 1200 });
          flash.current = 0.55;
          for (let i = 0; i < 24; i++) {
            sparks.current.push({ x: Math.random() * w, y: lz.y * h, vx: (Math.random() - 0.5) * 14, vy: (Math.random() - 0.5) * 10, life: 1 });
          }
          if (livesRef.current <= 0) {
            phaseRef.current = "finished";
            setPhase("finished");
            audio.stopMusic();
          }
        } else if (safe) {
          lz.scored = true;
          scoreRef.current += 200;
          setScore(scoreRef.current);
          audio.playCoin();
          audio.speak("ممتاز!", { cooldown: 2400 });
        }
      }

      // رسم شعاع الليزر بثلاث طبقات + انعكاس أرضي
      const py = lz.y * h;
      const color = lz.kind === "low" ? "#ff3d7f" : "#3df0ff";
      const width = Math.max(4, h * 0.012);
      glow(ctx, w * 0.5, py, w * 0.65, color, 0.22);
      neonBeam(ctx, 0, py, w, py, width, color);

      // مُصدِرات الليزر على الجانبين
      ctx.save();
      ctx.fillStyle = "#20202c";
      ctx.strokeStyle = withAlpha(color, 0.8);
      ctx.lineWidth = 2;
      for (const ex of [0, w]) {
        ctx.beginPath();
        ctx.roundRect(ex - w * 0.035, py - h * 0.022, w * 0.07, h * 0.044, 6);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.font = `${w * 0.07}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(lz.kind === "low" ? "⬆️" : "⬇️", w * 0.5, py - h * 0.05);
      ctx.restore();

      return lz.y < 1.2;
    });

    sparks.current.forEach((p) => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.life -= 0.028;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = "#ff6a9c";
      ctx.shadowBlur = 14; ctx.shadowColor = "#ff6a9c";
      ctx.beginPath(); ctx.arc(p.x, p.y, 4 * p.life + 1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
    sparks.current = sparks.current.filter((p) => p.life > 0);

    // مؤشر الحالة
    if (isPlaying) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.font = `${w * 0.07}px serif`;
      ctx.textAlign = "center";
      ctx.fillText(isJumping ? "🦘" : isDucking ? "🧎" : "🧍", w * 0.5, h * 0.93);
      ctx.restore();
    }

    const hnd = mirrored(lm?.[L.rWrist]);
    if (hnd) glow(ctx, hnd.x * w, hnd.y * h, w * 0.08, "#a855f7", 0.4);

    vignette(ctx, w, h, 0.5);

    flash.current *= 0.88;
    if (flash.current > 0.01) {
      ctx.fillStyle = `rgba(255,60,120,${flash.current})`;
      ctx.fillRect(0, 0, w, h);
    }
  }, []);

  const { videoRef, canvasRef, start, status, error, visible } = usePoseCamera((f) => onFrame(f), "rgba(180,120,255,0.35)");

  useEffect(() => () => { audio.stopMusic(); audio.stopSpeech(); }, []);

  const play = async () => {
    cal.current.reset();
    setCalib({ progress: 0, steady: false });
    await start();
    phaseRef.current = "calibrating";
    setPhase("calibrating");
    audio.speak("قف ثابت حتى نضبط حركاتك", { force: true });
  };

  const startPlaying = () => {
    if (phaseRef.current === "playing") return;
    lasers.current = [];
    sparks.current = [];
    livesRef.current = MAX_LIVES;
    scoreRef.current = 0;
    setLives(MAX_LIVES); setScore(0); setLevel(1);
    spawnAt.current = performance.now() + 900;
    phaseRef.current = "playing";
    setPhase("playing");
    audio.startKidsMusic(diffRef.current.bpm);
    audio.speak("اقفز فوق الوردي وانخفض تحت الأزرق!", { force: true });
  };

  return (
    <GameStage
      videoRef={videoRef} canvasRef={canvasRef} title="ممر الليزر" emoji="🔦" onBack={onBack}
      isCalibrating={phase === "calibrating"}
      isPoseVisible={visible}
      calibProgress={calib.progress}
      isSteady={calib.steady}
      hud={phase === "playing" ? (
        <>
          <KidHud label="النقاط" value={score.toLocaleString("ar-EG")} />
          <KidHud label="القلوب" value={"❤️".repeat(Math.max(0, lives)) || "💔"} />
          <KidHud label="المستوى" value={`${diff.emoji} ${level}`} />
        </>
      ) : null}
    >
      {phase === "idle" && (
        <div className="text-center">
          <h2 className="kid-title text-3xl font-black">ممر الليزر 🔦🥷</h2>
          <p className="mt-2 text-sm text-muted-foreground">اقفز فوق الليزر الوردي وانخفض تحت الليزر الأزرق. ثلاثة قلوب فقط!</p>
          <DifficultyPicker value={diffId} onChange={select} />
          {error && <p className="mt-2 text-xs text-red-400 font-bold">{error}</p>}
          <button onClick={play} disabled={status === "loading"} className="btn-kid mt-5 w-full shadow-2xl">
            {status === "loading" ? "نشغّل الليزر…" : "ابدأ التسلل! 🔦"}
          </button>
        </div>
      )}
      {phase === "finished" && (
        <div className="text-center">
          <h2 className="kid-title text-4xl">جاسوس ماهر! 🕵️</h2>
          <p className="mt-2 text-2xl font-bold text-fuchsia-400">{score.toLocaleString("ar-EG")} نقطة</p>
          <DifficultyPicker value={diffId} onChange={select} />
          <button onClick={play} className="btn-kid mt-5 w-full">محاولة جديدة 🔁</button>
        </div>
      )}
    </GameStage>
  );
}
