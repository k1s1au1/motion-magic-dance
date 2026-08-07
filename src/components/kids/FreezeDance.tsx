import { useCallback, useEffect, useRef, useState } from "react";
import GameStage, { KidHud } from "./GameStage";
import { usePoseCamera, type FrameInfo } from "@/lib/usePoseCamera";
import { L, type Landmarks } from "@/lib/dance";
import { audio } from "@/lib/audioUtils";

type Mode = "dance" | "freeze";
const ROUNDS = 8;

export default function FreezeDance({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<"idle" | "calibrating" | "playing" | "finished">("idle");
  const [mode, setMode] = useState<Mode>("dance");
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(1);
  const [motion, setMotion] = useState(0);

  const phaseRef = useRef<"idle" | "calibrating" | "playing" | "finished">("idle");
  const modeRef = useRef<Mode>("dance");
  const switchAt = useRef(0);
  const roundRef = useRef(1);
  const prev = useRef<Landmarks | null>(null);
  const motionRef = useRef(0);
  const scoredRef = useRef(false);
  const flash = useRef<{ text: string; t: number; good: boolean } | null>(null);
  const modeChangeAt = useRef(0);
  const discoLights = useRef<{x: number, y: number, r: number, vx: number, vy: number, color: string}[]>([]);
  const frostCrystals = useRef<{x: number, y: number, length: number, angle: number, opacity: number}[]>([]);
  const calibrationTimer = useRef(0);

  const setModeBoth = (m: Mode) => {
    modeRef.current = m;
    setMode(m);
    modeChangeAt.current = performance.now();
    if (m === "freeze") { audio.playStop(); audio.speak("تجمّد!", { force: true }); }
    else { audio.playStart(); audio.speak("ارقص!", { force: true }); }
  };

  const onFrame = useCallback(({ lm, ctx, w, h, dt, now, visible: poseOk }: FrameInfo) => {
    const isCalibrating = phaseRef.current === "calibrating";
    const isPlaying = phaseRef.current === "playing";

    if (lm && prev.current) {
      let sum = 0;
      const joints = [L.lWrist, L.rWrist, L.lElbow, L.rElbow, L.nose, L.lKnee, L.rKnee];
      for (const j of joints) {
        const a = lm[j];
        const b = prev.current[j];
        if (a && b) sum += Math.hypot(a.x - b.x, a.y - b.y);
      }
      motionRef.current = motionRef.current * 0.65 + (sum / joints.length) * 0.35 * 40;
    }
    if (lm) prev.current = lm;
    setMotion(Math.min(1, motionRef.current));

    // Calibration Logic
    if (isCalibrating) {
      if (poseOk) {
        calibrationTimer.current += dt;
        if (calibrationTimer.current > 2.0) {
          startPlaying();
        }
      } else {
        calibrationTimer.current = 0;
      }
    }

    // DISCO LIGHTS SYSTEM
    if (discoLights.current.length === 0) {
      for (let i = 0; i < 12; i++) {
        discoLights.current.push({
          x: Math.random() * w, y: Math.random() * h,
          r: w * 0.2 + Math.random() * w * 0.3,
          vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8,
          color: `hsla(${Math.random() * 360}, 100%, 70%, 0.4)`
        });
      }
    }
    discoLights.current.forEach(l => {
      l.x += l.vx; l.y += l.vy;
      if (l.x < 0 || l.x > w) l.vx *= -1;
      if (l.y < 0 || l.y > h) l.vy *= -1;
    });

    if (phaseRef.current === "playing") {
      const m = modeRef.current;
      const energy = motionRef.current;
      if (m === "freeze" && !scoredRef.current) {
        if (energy > 0.3) {
          flash.current = { text: "تحركت! ❄️", t: now, good: false };
          scoredRef.current = true;
          audio.playFail(); audio.speak("تحركت!");
          // Spawn frost on movement error
          for(let i=0; i<5; i++) {
            frostCrystals.current.push({
              x: Math.random()*w, y: Math.random()*h, length: 100, angle: Math.random()*Math.PI*2, opacity: 0.8
            });
          }
        }
      }
      if (now >= switchAt.current) {
        if (m === "dance") {
          setModeBoth("freeze");
          scoredRef.current = false;
          switchAt.current = now + 2800;
        } else {
          if (!scoredRef.current) {
            setScore((s) => s + 750);
            flash.current = { text: "تمثال أسطوري! 🗿", t: now, good: true };
            audio.playSuccess(); audio.speak("ممتاز!");
          }
          roundRef.current += 1;
          setRound(roundRef.current);
          if (roundRef.current > ROUNDS) {
            phaseRef.current = "finished";
            setPhase("finished");
          } else {
            setModeBoth("dance");
            switchAt.current = now + 3500 + Math.random() * 4000;
          }
        }
      }
      if (m === "dance" && energy > 0.2) setScore((s) => s + 5);
    }

    // DRAWING: EXTREME
    if (phaseRef.current === "playing") {
      ctx.save();
      const transitionElapsed = now - modeChangeAt.current;

      // 1. DANCE MODE: VOLUMETRIC GOD RAYS & DISCO
      if (modeRef.current === "dance") {
        // Disco Floor Reflection
        ctx.fillStyle = "rgba(100, 50, 200, 0.1)";
        ctx.fillRect(0, h * 0.7, w, h * 0.3);

        discoLights.current.forEach(l => {
          const grad = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
          grad.addColorStop(0, l.color); grad.addColorStop(1, "transparent");
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2); ctx.fill();
        });

        // Volumetric Light Shafts
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for (let i = 0; i < 5; i++) {
          const angle = Math.sin(now * 0.001 + i) * 0.2;
          const lx = w * 0.5 + Math.cos(now * 0.0005 + i) * w * 0.4;
          ctx.beginPath();
          ctx.moveTo(lx, -100);
          ctx.lineTo(lx + Math.sin(angle) * h, h + 100);
          ctx.lineTo(lx + Math.sin(angle) * h + 100, h + 100);
          ctx.lineTo(lx + 100, -100);
          const rayGrad = ctx.createLinearGradient(lx, 0, lx + Math.sin(angle) * h, h);
          rayGrad.addColorStop(0, "rgba(255, 255, 255, 0.15)");
          rayGrad.addColorStop(1, "transparent");
          ctx.fillStyle = rayGrad;
          ctx.fill();
        }
        ctx.restore();
      }

      // 2. OVERLAY TINT
      const transitionAlpha = transitionElapsed < 500 ? 0.4 - (transitionElapsed / 500) * 0.2 : 0.2;
      ctx.fillStyle = modeRef.current === "freeze" ? `rgba(180, 240, 255, ${transitionAlpha})` : `rgba(255, 200, 50, ${transitionAlpha})`;
      ctx.fillRect(0, 0, w, h);

      // 3. SKELETON WITH EXTREME BLOOM
      if (lm) {
        const glowColor = modeRef.current === "freeze" ? "#00ffff" : "#ffaa00";
        const pulse = 0.8 + Math.sin(now * 0.01) * 0.2;
        ctx.save();
        ctx.strokeStyle = glowColor;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 40 * pulse;
        ctx.lineWidth = 14;
        ctx.lineCap = "round";

        const conn: [number, number][] = [[11,12], [11,13], [13,15], [12,14], [14,16], [11,23], [12,24], [23,24], [23,25], [24,26], [25,27], [26,28]];
        conn.forEach(([a, b]) => {
          if (lm[a] && lm[b]) {
            ctx.beginPath(); ctx.moveTo(lm[a].x * w, lm[a].y * h); ctx.lineTo(lm[b].x * w, lm[b].y * h); ctx.stroke();
          }
        });
        if (lm[0]) {
          ctx.beginPath(); ctx.arc(lm[0].x * w, lm[0].y * h, w * 0.07, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
      }

      // 4. FREEZE MODE: PROCEDURAL FROST & CRACKING
      if (modeRef.current === "freeze") {
        // Deep Frost Screen Overlay
        const frostGrad = ctx.createRadialGradient(w/2, h/2, w*0.2, w/2, h/2, w*0.85);
        frostGrad.addColorStop(0, "transparent");
        frostGrad.addColorStop(0.7, "rgba(200, 240, 255, 0.4)");
        frostGrad.addColorStop(1, "rgba(255, 255, 255, 0.8)");
        ctx.fillStyle = frostGrad;
        ctx.fillRect(0, 0, w, h);

        // Dynamic Frost Crystals
        ctx.strokeStyle = "white";
        ctx.lineWidth = 3;
        for (let i = 0; i < 40; i++) {
          const seed = i + Math.floor(now/5000)*100;
          const x = (Math.sin(seed) * 0.5 + 0.5) * w;
          const y = (Math.cos(seed * 1.3) * 0.5 + 0.5) * h;
          if (Math.hypot(x - w/2, y - h/2) < w*0.35) continue; // Keep center clear

          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.sin(seed * 2.1) * Math.PI);
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          for(let j=0; j<6; j++) {
            ctx.rotate(Math.PI/3);
            ctx.moveTo(0,0); ctx.lineTo(0, 15 + Math.sin(now*0.005 + i)*5);
          }
          ctx.stroke();
          ctx.restore();
        }

        // Error Cracks
        frostCrystals.current.forEach(c => {
          ctx.save();
          ctx.globalAlpha = c.opacity;
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(c.x, c.y);
          for(let i=0; i<5; i++) {
            ctx.lineTo(c.x + Math.sin(c.angle + i*0.2)*c.length, c.y + Math.cos(c.angle + i*0.2)*c.length);
          }
          ctx.stroke();
          c.opacity -= 0.01;
          ctx.restore();
        });
        frostCrystals.current = frostCrystals.current.filter(c => c.opacity > 0);
      }

      // Transition Big UI
      if (transitionElapsed < 1200) {
        const emoji = modeRef.current === "freeze" ? "❄️" : "🎵";
        const k = transitionElapsed / 1200;
        const scale = 1 + Math.sin(k * Math.PI) * 1.5;
        ctx.save();
        ctx.globalAlpha = 1 - k;
        ctx.font = `bold ${w * 0.3 * scale}px system-ui`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.shadowColor = modeRef.current === "freeze" ? "cyan" : "gold";
        ctx.shadowBlur = 50;
        ctx.fillText(emoji, w / 2, h / 2);
        ctx.restore();
      }
      ctx.restore();
    }

    // Scores Pop
    if (flash.current && now - flash.current.t < 1000) {
      const f = flash.current;
      const k = (now - f.t) / 1000;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.translate(w/2, h*0.4);
      ctx.scale(1 + k, 1 + k);
      ctx.font = `black ${w * 0.12}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = f.good ? "#22c55e" : "#ef4444";
      ctx.shadowBlur = 30; ctx.shadowColor = ctx.fillStyle as string;
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
  }, []);

  const { videoRef, canvasRef, start, status, error, visible } = usePoseCamera((f) => onFrame(f), "hsl(280 100% 78%)");

  useEffect(() => {
    return () => { audio.stopMusic(); };
  }, []);

  const play = async () => {
    calibrationTimer.current = 0;
    await start();
    setPhaseBoth("calibrating");
  };

  const startPlaying = () => {
    if (phaseRef.current === "playing") return;
    setScore(0);
    roundRef.current = 1; setRound(1);
    prev.current = null; motionRef.current = 0;
    scoredRef.current = false; flash.current = null;
    setModeBoth("dance");
    switchAt.current = performance.now() + 4500;
    phaseRef.current = "playing"; setPhase("playing");
  };

  const setPhaseBoth = (p: typeof phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  return (
    <GameStage
      videoRef={videoRef} canvasRef={canvasRef}
      title="تمثال!" emoji="🗿" onBack={onBack}
      isCalibrating={phase === "calibrating"}
      isPoseVisible={visible}
      hud={phase === "playing" ? (
        <>
          <KidHud label="النقاط" value={score.toLocaleString("ar-EG")} />
          <KidHud label="الجولة" value={`${Math.min(round, ROUNDS)}/${ROUNDS}`} />
        </>
      ) : null}
      banner={phase === "playing" ? (
        <div className="relative mt-3 px-5 text-center">
          <div className={`kid-banner ${mode === "freeze" ? "kid-banner-freeze" : "kid-banner-dance"}`}>
            {mode === "freeze" ? "❄️ تجمّد ولا تتحرك!" : "🎵 ارقص وتحرك!"}
          </div>
          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-white/15">
            <div className="kid-bar h-full transition-all" style={{ width: `${Math.min(100, motion * 100)}%`, backgroundColor: motion > 0.4 ? "red" : "inherit" }} />
          </div>
        </div>
      ) : null}
    >
      {phase === "idle" && (
        <div className="text-center">
          <h2 className="kid-title text-3xl font-black">تمثال النيون! 🗿✨</h2>
          <p className="mt-2 text-sm text-muted-foreground opacity-80">أقوى تحدي تجمّد في العالم… هل أنت مستعد؟</p>
          <button onClick={play} disabled={status === "loading"} className="btn-kid mt-5 w-full shadow-2xl">
            {status === "loading" ? "جاري الشحن…" : "ابدأ التحدي! ⚡"}
          </button>
        </div>
      )}
      {phase === "finished" && (
        <div className="text-center animate-in zoom-in-95 duration-300">
          <h2 className="kid-title text-4xl">أسطورة! 🎉</h2>
          <p className="mt-2 text-2xl font-black text-gold">{score.toLocaleString("ar-EG")} نقطة</p>
          <button onClick={play} className="btn-kid mt-5 w-full">العب مرة أخرى 🔁</button>
        </div>
      )}
    </GameStage>
  );
}
