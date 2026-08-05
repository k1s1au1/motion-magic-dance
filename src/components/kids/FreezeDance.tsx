import { useCallback, useRef, useState } from "react";
import GameStage, { KidHud } from "./GameStage";
import { usePoseCamera, type FrameInfo } from "@/lib/usePoseCamera";
import { L, type Landmarks } from "@/lib/dance";

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

  const setModeBoth = (m: Mode) => {
    modeRef.current = m;
    setMode(m);
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

    if (phaseRef.current === "playing") {
      const m = modeRef.current;
      const energy = motionRef.current;
      if (m === "freeze" && !scoredRef.current) {
        if (energy > 0.35) {
          flash.current = { text: "تحركت! ❄️", t: now, good: false };
          scoredRef.current = true;
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

    // overlay tint
    ctx.save();
    ctx.fillStyle = modeRef.current === "freeze" ? "hsl(200 100% 60% / 0.16)" : "hsl(280 100% 60% / 0.08)";
    if (phaseRef.current === "playing") ctx.fillRect(0, 0, w, h);
    ctx.restore();

    if (flash.current && now - flash.current.t < 900) {
      const f = flash.current;
      ctx.save();
      ctx.globalAlpha = 1 - (now - f.t) / 900;
      ctx.font = `bold ${w * 0.09}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = f.good ? "hsl(140 90% 60%)" : "hsl(0 90% 65%)";
      ctx.fillText(f.text, w / 2, h * 0.5);
      ctx.restore();
    }
  }, []);

  const { videoRef, canvasRef, start, status, error, visible } = usePoseCamera(onFrame, "hsl(280 100% 78%)");

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
