import { useCallback, useEffect, useRef, useState } from "react";
import GameStage, { KidHud } from "./GameStage";
import { usePoseCamera, type FrameInfo } from "@/lib/usePoseCamera";
import { L, type Landmarks } from "@/lib/dance";
import { audio } from "@/lib/audioUtils";

type Mode = "dance" | "freeze";
const ROUNDS = 8;

/** لعبة "تمثال": ارقص لما تشوف الموسيقى، وتجمّد لما يطلع الثلج. */
export default function FreezeDance({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<"idle" | "playing" | "finished">("idle");
  const [mode, setMode] = useState<Mode>("dance");
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(1);
  const [motion, setMotion] = useState(0);

  const phaseRef = useRef<"idle" | "playing" | "finished">("idle");
  const modeRef = useRef<Mode>("dance");
  const switchAt = useRef(0);
  const roundRef = useRef(1);
  const prev = useRef<Landmarks | null>(null);
  const motionRef = useRef(0);
  const scoredRef = useRef(false);
  const flash = useRef<{ text: string; t: number; good: boolean } | null>(null);
  const modeChangeAt = useRef(0);
  const discoLights = useRef<{x: number, y: number, r: number, vx: number, vy: number, color: string}[]>([]);

  const setModeBoth = (m: Mode) => {
    modeRef.current = m;
    setMode(m);
    modeChangeAt.current = performance.now();
    if (m === "freeze") audio.playStop();
    else audio.playStart();
  };

  const onFrame = useCallback(({ lm, ctx, w, h, now }: FrameInfo) => {
    // motion energy from key joints
    if (lm && prev.current) {
      let sum = 0;
      const joints = [L.lWrist, L.rWrist, L.lElbow, L.rElbow, L.nose, L.lKnee, L.rKnee];
      for (const j of joints) {
        const a = lm[j];
        const b = prev.current[j];
        if (a && b) sum += Math.hypot(a.x - b.x, a.y - b.y);
      }
      motionRef.current = motionRef.current * 0.7 + (sum / joints.length) * 0.3 * 30;
    }
    if (lm) prev.current = lm;
    setMotion(Math.min(1, motionRef.current));

    // Update Disco Lights
    if (discoLights.current.length === 0) {
      for (let i = 0; i < 8; i++) {
        discoLights.current.push({
          x: Math.random() * w, y: Math.random() * h,
          r: w * 0.15 + Math.random() * w * 0.2,
          vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5,
          color: `hsla(${Math.random() * 360}, 70%, 60%, 0.3)`
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
        if (energy > 0.35) {
          flash.current = { text: "تحركت! ❄️", t: now, good: false };
          scoredRef.current = true;
          audio.playFail();
        }
      }
      if (now >= switchAt.current) {
        if (m === "dance") {
          setModeBoth("freeze");
          scoredRef.current = false;
          switchAt.current = now + 2600;
        } else {
          if (!scoredRef.current) {
            setScore((s) => s + 500);
            flash.current = { text: "تمثال ممتاز! 🗿", t: now, good: true };
            audio.playSuccess();
          }
          roundRef.current += 1;
          setRound(roundRef.current);
          if (roundRef.current > ROUNDS) {
            phaseRef.current = "finished";
            setPhase("finished");
          } else {
            setModeBoth("dance");
            switchAt.current = now + 3000 + Math.random() * 3000;
          }
        }
      }
      if (m === "dance" && energy > 0.25) setScore((s) => s + 2);
    }

    // 3. Drawing
    if (phaseRef.current === "playing") {
      ctx.save();
      const transitionElapsed = now - modeChangeAt.current;

      // Background Disco Lights
      if (modeRef.current === "dance") {
        discoLights.current.forEach(l => {
          const grad = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
          grad.addColorStop(0, l.color); grad.addColorStop(1, "transparent");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        });
      }

      // Mode Overlay
      const transitionAlpha = transitionElapsed < 400 ? 0.35 - (transitionElapsed / 400) * 0.15 : 0.15;
      if (modeRef.current === "freeze") {
        ctx.fillStyle = `rgba(135, 206, 250, ${transitionAlpha})`; // Ice Blue
      } else {
        ctx.fillStyle = `rgba(255, 215, 0, ${transitionAlpha})`; // Gold
      }
      ctx.fillRect(0, 0, w, h);

      // Skeleton Drawing
      if (lm) {
        const glowColor = modeRef.current === "freeze" ? "#00ffff" : "#ffd700";
        ctx.strokeStyle = glowColor;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 20;
        ctx.lineWidth = 10;
        ctx.lineCap = "round";

        const connections: [number, number][] = [
          [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
          [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28]
        ];
        connections.forEach(([a, b]) => {
          if (lm[a] && lm[b]) {
            ctx.beginPath();
            ctx.moveTo(lm[a].x * w, lm[a].y * h);
            ctx.lineTo(lm[b].x * w, lm[b].y * h);
            ctx.stroke();
          }
        });
        if (lm[0]) {
          ctx.beginPath();
          ctx.arc(lm[0].x * w, lm[0].y * h, w * 0.05, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Frost Effect
      if (modeRef.current === "freeze") {
        const frostGrad = ctx.createRadialGradient(w/2, h/2, w*0.3, w/2, h/2, w*0.7);
        frostGrad.addColorStop(0, "transparent");
        frostGrad.addColorStop(1, "rgba(255, 255, 255, 0.6)");
        ctx.fillStyle = frostGrad;
        ctx.fillRect(0, 0, w, h);

        // Ice crystals on edges
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 2;
        for (let i = 0; i < 20; i++) {
          const side = i % 4;
          let x = 0, y = 0;
          if (side === 0) { x = Math.random() * w; y = 0; }
          else if (side === 1) { x = w; y = Math.random() * h; }
          else if (side === 2) { x = Math.random() * w; y = h; }
          else { x = 0; y = Math.random() * h; }
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + (Math.random()-0.5)*50, y + (Math.random()-0.5)*50);
          ctx.stroke();
        }
      }

      // Draw big emoji during transition
      if (transitionElapsed < 1000) {
        const emoji = modeRef.current === "freeze" ? "❄️" : "🎵";
        const scale = 1 + Math.sin((transitionElapsed / 1000) * Math.PI) * 0.5;
        ctx.globalAlpha = 1 - transitionElapsed / 1000;
        ctx.font = `${w * 0.3 * scale}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(emoji, w / 2, h / 2);
      }
      ctx.restore();
    }

    if (flash.current && now - flash.current.t < 900) {
      const f = flash.current;
      ctx.save();
      ctx.globalAlpha = 1 - (now - f.t) / 900;
      ctx.font = `bold ${w * 0.09}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = f.good ? "hsl(140 90% 60%)" : "hsl(0 90% 65%)";
      ctx.fillText(f.text, w / 2, h * 0.7);
      ctx.restore();
    }
  }, []);

  const { videoRef, canvasRef, start, status, error, visible } = usePoseCamera(onFrame, "hsl(280 100% 78%)");

  useEffect(() => {
    return () => {
      audio.stopMusic();
    };
  }, []);

  const play = async () => {
    await start();
    setScore(0);
    roundRef.current = 1;
    setRound(1);
    prev.current = null;
    motionRef.current = 0;
    scoredRef.current = false;
    flash.current = null;
    setModeBoth("dance");
    switchAt.current = performance.now() + 4000;
    phaseRef.current = "playing";
    setPhase("playing");
  };

  return (
    <GameStage
      videoRef={videoRef}
      canvasRef={canvasRef}
      title="تمثال!"
      emoji="🗿"
      onBack={onBack}
      hud={
        phase === "playing" ? (
          <>
            <KidHud label="النقاط" value={score.toLocaleString("ar-EG")} />
            <KidHud label="الجولة" value={`${Math.min(round, ROUNDS)}/${ROUNDS}`} />
          </>
        ) : null
      }
      banner={
        phase === "playing" ? (
          <div className="relative mt-3 px-5 text-center">
            <div className={`kid-banner ${mode === "freeze" ? "kid-banner-freeze" : "kid-banner-dance"}`}>
              {mode === "freeze" ? "❄️ تجمّد ولا تتحرك!" : "🎵 ارقص وتحرك!"}
            </div>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-white/15">
              <div className="kid-bar h-full" style={{ width: `${Math.min(100, motion * 100)}%` }} />
            </div>
          </div>
        ) : null
      }
    >
      {phase === "idle" && (
        <div className="text-center">
          <h2 className="kid-title text-3xl">تمثال! 🗿</h2>
          <p className="mt-2 text-sm text-muted-foreground">ارقص لما تشوف 🎵، وتجمّد فورًا لما تشوف ❄️</p>
          {error && <p className="mt-3 text-sm text-[var(--kid-red)]">{error}</p>}
          <button onClick={play} disabled={status === "loading"} className="btn-kid mt-5 w-full">
            {status === "loading" ? "جاري التجهيز…" : "يلا نرقص!"}
          </button>
        </div>
      )}
      {phase === "playing" && (
        <p className="text-center text-xs text-muted-foreground">{visible ? "أنت في الكادر 👍" : "ابعد شوي عن الجوال 🙂"}</p>
      )}
      {phase === "finished" && (
        <div className="text-center">
          <h2 className="kid-title text-3xl">خلصت اللعبة! 🎉</h2>
          <p className="mt-2 text-lg font-bold">{score.toLocaleString("ar-EG")} نقطة</p>
          <button onClick={play} className="btn-kid mt-5 w-full">
            العب مرة ثانية 🔁
          </button>
        </div>
      )}
    </GameStage>
  );
}
