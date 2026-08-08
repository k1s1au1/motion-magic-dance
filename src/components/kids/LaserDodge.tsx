import { useCallback, useEffect, useRef, useState } from "react";
import GameStage, { KidHud } from "./GameStage";
import { mirrored, usePoseCamera, type FrameInfo } from "@/lib/usePoseCamera";
import { L } from "@/lib/dance";
import { audio } from "@/lib/audioUtils";

type Laser = { y: number; vy: number; kind: "high" | "low"; hinted: boolean; scored: boolean };
type Spark = { x: number; y: number; vx: number; vy: number; life: number };

const MAX_LIVES = 3;

export default function LaserDodge({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<"idle" | "calibrating" | "playing" | "finished">("idle");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [level, setLevel] = useState(1);
  const phaseRef = useRef<"idle" | "calibrating" | "playing" | "finished">("idle");
  const lasers = useRef<Laser[]>([]);
  const sparks = useRef<Spark[]>([]);
  const spawnAt = useRef(0);
  const calibTimer = useRef(0);
  const livesRef = useRef(MAX_LIVES);
  const scoreRef = useRef(0);
  const baseNoseY = useRef(0.45);
  const bodyScale = useRef(0.18);
  const invuln = useRef(0);
  const flash = useRef(0);

  const onFrame = useCallback(({ lm, ctx, w, h, dt, now, visible: poseOk }: FrameInfo) => {
    const isCalibrating = phaseRef.current === "calibrating";
    const isPlaying = phaseRef.current === "playing";

    // خلفية معمل ليزر
    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w);
    bg.addColorStop(0, "#160a28");
    bg.addColorStop(1, "#05030c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(160,80,255,0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath(); ctx.moveTo((i / 12) * w, 0); ctx.lineTo((i / 12) * w, h); ctx.stroke();
    }

    // معايرة الجسم
    const nose = lm?.[L.nose];
    const ls = lm?.[L.lShoulder], rs = lm?.[L.rShoulder];
    if (nose && ls && rs) {
      const shoulders = Math.max(0.08, Math.abs(ls.x - rs.x));
      if (isCalibrating) {
        const k = 0.15;
        baseNoseY.current = baseNoseY.current * (1 - k) + nose.y * k;
        bodyScale.current = bodyScale.current * (1 - k) + shoulders * k;
      }
    }

    if (isCalibrating) {
      if (poseOk) {
        calibTimer.current += dt;
        if (calibTimer.current > 2) startPlaying();
      } else calibTimer.current = 0;
    }

    const scale = Math.max(0.08, bodyScale.current);
    const dy = nose ? nose.y - baseNoseY.current : 0;
    const isJumping = dy < -scale * 0.4;
    const isDucking = dy > scale * 0.5;

    if (isPlaying && now >= spawnAt.current) {
      const lvl = 1 + Math.floor(scoreRef.current / 800);
      setLevel(lvl);
      spawnAt.current = now + Math.max(900, 1900 - lvl * 130);
      const kind: "high" | "low" = Math.random() < 0.5 ? "high" : "low";
      lasers.current.push({ y: -0.1, vy: 0.35 + lvl * 0.04, kind, hinted: false, scored: false });
    }

    invuln.current = Math.max(0, invuln.current - dt);

    lasers.current = lasers.current.filter((lz) => {
      lz.y += lz.vy * dt;

      if (isPlaying && !lz.hinted && lz.y > 0.25) {
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

      // رسم شعاع الليزر
      const py = lz.y * h;
      const color = lz.kind === "low" ? "#ff3d7f" : "#3df0ff";
      ctx.save();
      ctx.shadowBlur = 30;
      ctx.shadowColor = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = h * 0.02;
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = h * 0.06;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.font = `${w * 0.07}px serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(lz.kind === "low" ? "⬆️" : "⬇️", w * 0.5, py - h * 0.045);
      ctx.restore();

      return lz.y < 1.2;
    });

    sparks.current.forEach((p) => {
      p.x += p.vx; p.y += p.vy; p.life -= 0.03;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = "#ff6a9c";
      ctx.shadowBlur = 12; ctx.shadowColor = "#ff6a9c";
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
    sparks.current = sparks.current.filter((p) => p.life > 0);

    // مؤشر الحالة
    if (isPlaying) {
      ctx.save();
      ctx.font = `${w * 0.06}px serif`;
      ctx.textAlign = "center";
      ctx.fillText(isJumping ? "🦘" : isDucking ? "🧎" : "🧍", w * 0.5, h * 0.93);
      ctx.restore();
    }

    // خط الأمان
    const hnd = mirrored(lm?.[L.rWrist]);
    if (hnd) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#a855f7";
      ctx.beginPath(); ctx.arc(hnd.x * w, hnd.y * h, w * 0.03, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    flash.current *= 0.88;
    if (flash.current > 0.01) {
      ctx.fillStyle = `rgba(255,60,120,${flash.current})`;
      ctx.fillRect(0, 0, w, h);
    }
  }, []);

  const { videoRef, canvasRef, start, status, error, visible } = usePoseCamera((f) => onFrame(f), "rgba(180,120,255,0.3)");

  useEffect(() => () => { audio.stopMusic(); audio.stopSpeech(); }, []);

  const play = async () => {
    calibTimer.current = 0;
    await start();
    phaseRef.current = "calibrating";
    setPhase("calibrating");
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
    audio.startKidsMusic(150);
    audio.speak("اقفز فوق الأحمر وانخفض تحت الأزرق!", { force: true });
  };

  return (
    <GameStage
      videoRef={videoRef} canvasRef={canvasRef} title="ممر الليزر" emoji="🔦" onBack={onBack}
      isCalibrating={phase === "calibrating"}
      isPoseVisible={visible}
      hud={phase === "playing" ? (
        <>
          <KidHud label="النقاط" value={score.toLocaleString("ar-EG")} />
          <KidHud label="القلوب" value={"❤️".repeat(Math.max(0, lives)) || "💔"} />
          <KidHud label="المستوى" value={String(level)} />
        </>
      ) : null}
    >
      {phase === "idle" && (
        <div className="text-center">
          <h2 className="kid-title text-3xl font-black">ممر الليزر 🔦🥷</h2>
          <p className="mt-2 text-sm text-muted-foreground">اقفز فوق الليزر الوردي وانخفض تحت الليزر الأزرق. ثلاثة قلوب فقط!</p>
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
          <button onClick={play} className="btn-kid mt-5 w-full">محاولة جديدة 🔁</button>
        </div>
      )}
    </GameStage>
  );
}
