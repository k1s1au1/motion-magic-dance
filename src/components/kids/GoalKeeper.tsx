import { useCallback, useEffect, useRef, useState } from "react";
import GameStage, { KidHud } from "./GameStage";
import DifficultyPicker from "./DifficultyPicker";
import { mirrored, usePoseCamera, type FrameInfo } from "@/lib/usePoseCamera";
import { L } from "@/lib/dance";
import { audio } from "@/lib/audioUtils";
import { useDifficulty } from "@/lib/difficulty";
import { createCalibrator, makeSmoother } from "@/lib/calibration";
import { drawSphere, glow, groundShadow, vignette } from "@/lib/gfx";

type Ball = { x: number; y: number; tx: number; ty: number; z: number; speed: number; done: boolean; hinted: boolean; spin: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string };

const MAX_GOALS = 5;

export default function GoalKeeper({ onBack }: { onBack: () => void }) {
  const { diff, id: diffId, select } = useDifficulty();
  const diffRef = useRef(diff);
  diffRef.current = diff;

  const [phase, setPhase] = useState<"idle" | "calibrating" | "playing" | "finished">("idle");
  const [saves, setSaves] = useState(0);
  const [goals, setGoals] = useState(0);
  const [score, setScore] = useState(0);
  const [calib, setCalib] = useState({ progress: 0, steady: false });
  const phaseRef = useRef<"idle" | "calibrating" | "playing" | "finished">("idle");
  const balls = useRef<Ball[]>([]);
  const sparks = useRef<Spark[]>([]);
  const spawnAt = useRef(0);
  const goalsRef = useRef(0);
  const flash = useRef(0);
  const shake = useRef(0);
  const cal = useRef(createCalibrator({ holdSeconds: 1.4 }));
  const smoothL = useRef(makeSmoother(0.5));
  const smoothR = useRef(makeSmoother(0.5));

  const burst = (x: number, y: number, color: string, n = 20) => {
    for (let i = 0; i < n; i++) {
      sparks.current.push({ x, y, vx: (Math.random() - 0.5) * 16, vy: (Math.random() - 0.5) * 16, life: 1, color });
    }
  };

  const onFrame = useCallback(({ lm, ctx, w, h, dt, now, visible: poseOk }: FrameInfo) => {
    const isCalibrating = phaseRef.current === "calibrating";
    const isPlaying = phaseRef.current === "playing";
    const d = diffRef.current;

    // ملعب ليلي بإضاءة كشافات
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#07301f");
    sky.addColorStop(0.55, "#0a3d26");
    sky.addColorStop(1, "#031008");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    glow(ctx, w * 0.2, -h * 0.05, w * 0.9, "#eaffea", 0.12);
    glow(ctx, w * 0.8, -h * 0.05, w * 0.9, "#eaffea", 0.12);

    // خطوط العشب بمنظور
    ctx.save();
    for (let i = 0; i < 10; i++) {
      const t0 = Math.pow(i / 10, 1.8), t1 = Math.pow((i + 1) / 10, 1.8);
      ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.05)";
      ctx.fillRect(0, h * 0.5 + t0 * h * 0.5, w, (t1 - t0) * h * 0.5 + 1);
    }
    ctx.restore();

    // المرمى ثلاثي الأبعاد بشبكة
    ctx.save();
    ctx.translate(shake.current * (Math.random() - 0.5) * 20, 0);
    const gx = w * 0.08, gy = h * 0.18, gw = w * 0.84, gh = h * 0.6;
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 20; i++) {
      ctx.beginPath(); ctx.moveTo(gx + (gw / 20) * i, gy); ctx.lineTo(gx + (gw / 20) * i, gy + gh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gx, gy + (gh / 20) * i); ctx.lineTo(gx + gw, gy + (gh / 20) * i); ctx.stroke();
    }
    const post = ctx.createLinearGradient(0, gy, 0, gy + gh);
    post.addColorStop(0, "#ffffff");
    post.addColorStop(1, "#c9d6d0");
    ctx.strokeStyle = post;
    ctx.lineWidth = w * 0.022;
    ctx.lineJoin = "round";
    ctx.shadowBlur = 22;
    ctx.shadowColor = "rgba(255,255,255,0.5)";
    ctx.strokeRect(gx, gy, gw, gh);
    ctx.restore();
    shake.current *= 0.85;

    const st = cal.current.update(lm, dt, isCalibrating, poseOk);
    cal.current.setTolerance(d.tolerance);
    if (isCalibrating) {
      setCalib({ progress: st.progress, steady: st.steady });
      if (st.ready) startPlaying();
    }

    if (isPlaying && now >= spawnAt.current) {
      spawnAt.current = now + (1500 + Math.random() * 900) * d.spawn;
      balls.current.push({
        x: 0.5, y: 0.42,
        tx: 0.15 + Math.random() * 0.7,
        ty: 0.2 + Math.random() * 0.55,
        z: 0, speed: (0.45 + Math.random() * 0.25) * d.speed, done: false, hinted: false,
        spin: (Math.random() - 0.5) * 8,
      });
    }

    const hands = [smoothL.current(mirrored(lm?.[L.lWrist])), smoothR.current(mirrored(lm?.[L.rWrist]))]
      .filter(Boolean) as { x: number; y: number }[];

    balls.current = balls.current.filter((b) => {
      b.z += b.speed * dt;
      const t = Math.min(1, b.z);
      b.x = 0.5 + (b.tx - 0.5) * t;
      b.y = 0.42 + (b.ty - 0.42) * t;

      if (isPlaying && !b.hinted && t > 0.25) {
        b.hinted = true;
        audio.speak(b.tx < 0.4 ? "يسار!" : b.tx > 0.6 ? "يمين!" : "أمامك!", { cooldown: 900 });
      }

      const r = (0.03 + t * 0.09) * w;
      if (isPlaying && t > 0.55 && !b.done) {
        for (const hnd of hands) {
          if (Math.hypot((hnd.x - b.x) * w, (hnd.y - b.y) * h) < r * 1.5 * d.tolerance) {
            b.done = true;
            setSaves((s) => s + 1);
            setScore((s) => s + 250);
            audio.playSuccess();
            audio.speak("تصدي رائع!", { cooldown: 1800 });
            burst(b.x * w, b.y * h, "#7cf7ff", 24);
            flash.current = 0.3;
            return false;
          }
        }
      }

      if (t >= 1) {
        if (isPlaying) {
          goalsRef.current += 1;
          setGoals(goalsRef.current);
          audio.playFail();
          audio.speak("هدف! ركّز", { cooldown: 1500 });
          burst(b.x * w, b.y * h, "#ff5555", 26);
          shake.current = 1;
          if (goalsRef.current >= MAX_GOALS) {
            phaseRef.current = "finished";
            setPhase("finished");
            audio.stopMusic();
          }
        }
        return false;
      }

      // كرة مجسّمة بظل ودوران
      const px = b.x * w, py = b.y * h;
      groundShadow(ctx, px, Math.min(h * 0.98, py + r * 1.9), r * 1.3, 0.3 * t + 0.1);
      drawSphere(ctx, px, py, r, "#f4f4f4", { glow: "rgba(255,255,255,0.75)" });
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(b.z * b.spin);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "#12181c";
      for (let i = 0; i < 5; i++) {
        const a = i * 1.257;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * r * 0.48, Math.sin(a) * r * 0.48, r * 0.2, r * 0.16, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return true;
    });

    sparks.current.forEach((p) => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.3; p.life -= 0.03;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 14;
      ctx.shadowColor = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 5 * p.life + 1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
    sparks.current = sparks.current.filter((p) => p.life > 0);

    // قفازات الحارس
    hands.forEach((hnd) => {
      const hx = hnd.x * w, hy = hnd.y * h;
      glow(ctx, hx, hy, w * 0.13, "#7cf7ff", 0.45);
      ctx.save();
      ctx.font = `${w * 0.1}px serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("🧤", hx, hy);
      ctx.restore();
    });

    vignette(ctx, w, h, 0.55);

    flash.current *= 0.88;
    if (flash.current > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${flash.current})`;
      ctx.fillRect(0, 0, w, h);
    }
  }, []);

  const { videoRef, canvasRef, start, status, error, visible } = usePoseCamera((f) => onFrame(f), "rgba(124,247,255,0.3)");

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
    balls.current = [];
    sparks.current = [];
    goalsRef.current = 0;
    setGoals(0); setSaves(0); setScore(0);
    spawnAt.current = performance.now() + 800;
    phaseRef.current = "playing";
    setPhase("playing");
    audio.startKidsMusic(diffRef.current.bpm);
    audio.speak("صد الكرات بيديك!", { force: true });
  };

  return (
    <GameStage
      videoRef={videoRef} canvasRef={canvasRef} title="حارس المرمى" emoji="🥅" onBack={onBack}
      isCalibrating={phase === "calibrating"}
      isPoseVisible={visible}
      calibProgress={calib.progress}
      isSteady={calib.steady}
      hud={phase === "playing" ? (
        <>
          <KidHud label="تصديات" value={String(saves)} />
          <KidHud label="أهداف" value={`${goals}/${MAX_GOALS}`} />
          <KidHud label="النقاط" value={score.toLocaleString("ar-EG")} />
        </>
      ) : null}
    >
      {phase === "idle" && (
        <div className="text-center">
          <h2 className="kid-title text-3xl font-black">حارس المرمى 🧤⚽</h2>
          <p className="mt-2 text-sm text-muted-foreground">مدّ يديك وصد الكرات قبل ما تدخل المرمى! خمسة أهداف وتخسر.</p>
          <DifficultyPicker value={diffId} onChange={select} />
          {error && <p className="mt-2 text-xs text-red-400 font-bold">{error}</p>}
          <button onClick={play} disabled={status === "loading"} className="btn-kid mt-5 w-full shadow-2xl">
            {status === "loading" ? "نجهّز الملعب…" : "ادخل المرمى! 🧤"}
          </button>
        </div>
      )}
      {phase === "finished" && (
        <div className="text-center">
          <h2 className="kid-title text-4xl">حارس بطل! 🏆</h2>
          <p className="mt-2 text-2xl font-bold text-cyan-300">{saves} تصدي — {score.toLocaleString("ar-EG")} نقطة</p>
          <DifficultyPicker value={diffId} onChange={select} />
          <button onClick={play} className="btn-kid mt-5 w-full">مباراة جديدة 🔁</button>
        </div>
      )}
    </GameStage>
  );
}
