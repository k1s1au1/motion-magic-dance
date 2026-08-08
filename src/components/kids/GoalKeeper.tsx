import { useCallback, useEffect, useRef, useState } from "react";
import GameStage, { KidHud } from "./GameStage";
import { mirrored, usePoseCamera, type FrameInfo } from "@/lib/usePoseCamera";
import { L } from "@/lib/dance";
import { audio } from "@/lib/audioUtils";

type Ball = { x: number; y: number; tx: number; ty: number; z: number; speed: number; done: boolean; hinted: boolean };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string };

const MAX_GOALS = 5;

export default function GoalKeeper({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<"idle" | "calibrating" | "playing" | "finished">("idle");
  const [saves, setSaves] = useState(0);
  const [goals, setGoals] = useState(0);
  const [score, setScore] = useState(0);
  const phaseRef = useRef<"idle" | "calibrating" | "playing" | "finished">("idle");
  const balls = useRef<Ball[]>([]);
  const sparks = useRef<Spark[]>([]);
  const spawnAt = useRef(0);
  const calibTimer = useRef(0);
  const goalsRef = useRef(0);
  const flash = useRef(0);
  const shake = useRef(0);

  const burst = (x: number, y: number, color: string, n = 20) => {
    for (let i = 0; i < n; i++) {
      sparks.current.push({ x, y, vx: (Math.random() - 0.5) * 16, vy: (Math.random() - 0.5) * 16, life: 1, color });
    }
  };

  const onFrame = useCallback(({ lm, ctx, w, h, dt, now, visible: poseOk }: FrameInfo) => {
    const isCalibrating = phaseRef.current === "calibrating";
    const isPlaying = phaseRef.current === "playing";

    // ملعب
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#0b2a1a");
    sky.addColorStop(1, "#04120b");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    for (let i = 0; i < 8; i++) ctx.fillRect(0, h * 0.55 + i * h * 0.06, w, h * 0.03);

    // المرمى
    ctx.save();
    ctx.translate(shake.current * (Math.random() - 0.5) * 20, 0);
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = w * 0.02;
    ctx.shadowBlur = 18;
    ctx.shadowColor = "rgba(255,255,255,0.4)";
    const gx = w * 0.08, gy = h * 0.18, gw = w * 0.84, gh = h * 0.6;
    ctx.strokeRect(gx, gy, gw, gh);
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 2;
    for (let i = 1; i < 12; i++) {
      ctx.beginPath(); ctx.moveTo(gx + (gw / 12) * i, gy); ctx.lineTo(gx + (gw / 12) * i, gy + gh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gx, gy + (gh / 12) * i); ctx.lineTo(gx + gw, gy + (gh / 12) * i); ctx.stroke();
    }
    ctx.restore();
    shake.current *= 0.85;

    if (isCalibrating) {
      if (poseOk) {
        calibTimer.current += dt;
        if (calibTimer.current > 2) startPlaying();
      } else calibTimer.current = 0;
    }

    if (isPlaying && now >= spawnAt.current) {
      spawnAt.current = now + 1500 + Math.random() * 900;
      balls.current.push({
        x: 0.5, y: 0.42,
        tx: 0.15 + Math.random() * 0.7,
        ty: 0.2 + Math.random() * 0.55,
        z: 0, speed: 0.45 + Math.random() * 0.25, done: false, hinted: false,
      });
    }

    const hands = [mirrored(lm?.[L.lWrist]), mirrored(lm?.[L.rWrist])].filter(Boolean) as { x: number; y: number }[];

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
      if (isPlaying && t > 0.6 && !b.done) {
        for (const hnd of hands) {
          if (Math.hypot((hnd.x - b.x) * w, (hnd.y - b.y) * h) < r * 1.5) {
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

      // رسم الكرة
      const px = b.x * w, py = b.y * h;
      ctx.save();
      ctx.shadowBlur = 24;
      ctx.shadowColor = "rgba(255,255,255,0.7)";
      ctx.fillStyle = "#fdfdfd";
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111";
      for (let i = 0; i < 5; i++) {
        const a = i * 1.257 + b.z * 4;
        ctx.beginPath();
        ctx.arc(px + Math.cos(a) * r * 0.5, py + Math.sin(a) * r * 0.5, r * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return true;
    });

    sparks.current.forEach((p) => {
      p.x += p.vx; p.y += p.vy; p.life -= 0.03;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 12;
      ctx.shadowColor = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
    sparks.current = sparks.current.filter((p) => p.life > 0);

    // قفازات
    hands.forEach((hnd) => {
      ctx.save();
      const hx = hnd.x * w, hy = hnd.y * h;
      ctx.shadowBlur = 25;
      ctx.shadowColor = "#7cf7ff";
      ctx.fillStyle = "rgba(124,247,255,0.35)";
      ctx.beginPath(); ctx.arc(hx, hy, w * 0.075, 0, Math.PI * 2); ctx.fill();
      ctx.font = `${w * 0.09}px serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("🧤", hx, hy);
      ctx.restore();
    });

    flash.current *= 0.88;
    if (flash.current > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${flash.current})`;
      ctx.fillRect(0, 0, w, h);
    }
  }, []);

  const { videoRef, canvasRef, start, status, error, visible } = usePoseCamera((f) => onFrame(f), "rgba(124,247,255,0.3)");

  useEffect(() => () => { audio.stopMusic(); audio.stopSpeech(); }, []);

  const play = async () => {
    calibTimer.current = 0;
    await start();
    phaseRef.current = "calibrating";
    setPhase("calibrating");
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
    audio.startKidsMusic(138);
    audio.speak("صد الكرات بيديك!", { force: true });
  };

  return (
    <GameStage
      videoRef={videoRef} canvasRef={canvasRef} title="حارس المرمى" emoji="🥅" onBack={onBack}
      isCalibrating={phase === "calibrating"}
      isPoseVisible={visible}
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
          <button onClick={play} className="btn-kid mt-5 w-full">مباراة جديدة 🔁</button>
        </div>
      )}
    </GameStage>
  );
}
