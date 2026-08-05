import { useCallback, useEffect, useRef, useState } from "react";
import GameStage, { KidHud } from "./GameStage";
import { mirrored, usePoseCamera, type FrameInfo } from "@/lib/usePoseCamera";
import { L } from "@/lib/dance";
import { audio } from "@/lib/audioUtils";

type Star = { x: number; y: number; vy: number; kind: "star" | "bomb"; r: number };

const GAME_MS = 60000;

export default function StarCatcher({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<"idle" | "playing" | "finished">("idle");
  const [score, setScore] = useState(0);
  const [caught, setCaught] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const phaseRef = useRef<"idle" | "playing" | "finished">("idle");
  const items = useRef<Star[]>([]);
  const spawnAt = useRef(0);
  const endAt = useRef(0);
  const popRef = useRef<{ x: number; y: number; t: number; kind: Star["kind"] }[]>([]);

  const onFrame = useCallback(({ lm, ctx, w, h, dt, now }: FrameInfo) => {
    if (phaseRef.current === "playing") {
      setTimeLeft(Math.max(0, Math.ceil((endAt.current - now) / 1000)));
      if (now >= endAt.current) {
        phaseRef.current = "finished";
        setPhase("finished");
      }
      if (now >= spawnAt.current) {
        spawnAt.current = now + 700 + Math.random() * 500;
        items.current.push({
          x: 0.1 + Math.random() * 0.8,
          y: -0.08,
          vy: 0.16 + Math.random() * 0.12,
          kind: Math.random() < 0.18 ? "bomb" : "star",
          r: 0.075,
        });
      }
    }

    const hands = [mirrored(lm?.[L.lWrist]), mirrored(lm?.[L.rWrist])].filter(Boolean) as { x: number; y: number }[];

    items.current = items.current.filter((it) => {
      it.y += it.vy * dt;
      let hit = false;
      if (phaseRef.current === "playing") {
        for (const hnd of hands) {
          if (Math.hypot(hnd.x - it.x, (hnd.y - it.y) * (h / w)) < it.r) {
            hit = true;
            break;
          }
        }
      }
      if (hit) {
        popRef.current.push({ x: it.x, y: it.y, t: now, kind: it.kind });
        if (it.kind === "star") {
          setScore((s) => s + 100);
          setCaught((c) => c + 1);
          audio.playCoin();
        } else {
          setScore((s) => Math.max(0, s - 50));
          audio.playFail();
        }
        return false;
      }
      return it.y < 1.15;
    });

    // draw falling items
    for (const it of items.current) {
      const px = it.x * w;
      const py = it.y * h;
      const size = it.r * w * 1.5;
      ctx.save();
      ctx.font = `${size}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = it.kind === "star" ? "gold" : "red";
      ctx.shadowBlur = 22;
      ctx.fillText(it.kind === "star" ? "⭐" : "💣", px, py);
      ctx.restore();
    }

    // pop feedback
    popRef.current = popRef.current.filter((p) => now - p.t < 500);
    for (const p of popRef.current) {
      const k = (now - p.t) / 500;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.font = `${(0.06 + k * 0.06) * w * 1.6}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.kind === "star" ? "✨" : "💥", p.x * w, (p.y - k * 0.08) * h);
      ctx.restore();
    }

    // hand halos
    for (const hnd of hands) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(hnd.x * w, hnd.y * h, 0.06 * w, 0, Math.PI * 2);
      ctx.fillStyle = "hsl(50 100% 60% / 0.25)";
      ctx.fill();
      ctx.restore();
    }
  }, []);

  const { videoRef, canvasRef, start, status, error, visible } = usePoseCamera(onFrame, "hsl(190 100% 70%)");

  useEffect(() => {
    return () => {
      audio.stopMusic();
    };
  }, []);

  const play = async () => {
    await start();
    items.current = [];
    popRef.current = [];
    setScore(0);
    setCaught(0);
    setTimeLeft(60);
    spawnAt.current = performance.now();
    endAt.current = performance.now() + GAME_MS;
    phaseRef.current = "playing";
    setPhase("playing");
    audio.startKidsMusic();
  };

  return (
    <GameStage
      videoRef={videoRef}
      canvasRef={canvasRef}
      title="اصطاد النجوم"
      emoji="⭐"
      onBack={onBack}
      hud={
        phase === "playing" ? (
          <>
            <KidHud label="النقاط" value={score.toLocaleString("ar-EG")} />
            <KidHud label="الوقت" value={`${timeLeft}`} />
          </>
        ) : null
      }
    >
      {phase === "idle" && (
        <div className="text-center">
          <h2 className="kid-title text-3xl">اصطاد النجوم ⭐</h2>
          <p className="mt-2 text-sm text-muted-foreground">حرّك يديك والمس النجوم النازلة… وابتعد عن القنابل 💣</p>
          {error && <p className="mt-3 text-sm text-[var(--kid-red)]">{error}</p>}
          <button onClick={play} disabled={status === "loading"} className="btn-kid mt-5 w-full">
            {status === "loading" ? "جاري التجهيز…" : "يلا نلعب!"}
          </button>
        </div>
      )}
      {phase === "playing" && (
        <p className="text-center text-xs text-muted-foreground">
          {visible ? `نجوم ممسوكة: ${caught}` : "ابعد شوي عن الجوال عشان تبين كامل 🙂"}
        </p>
      )}
      {phase === "finished" && (
        <div className="text-center">
          <h2 className="kid-title text-3xl">أحسنت! 🎉</h2>
          <p className="mt-2 text-lg font-bold">{score.toLocaleString("ar-EG")} نقطة</p>
          <p className="text-sm text-muted-foreground">نجوم ممسوكة: {caught}</p>
          <button onClick={play} className="btn-kid mt-5 w-full">
            العب مرة ثانية 🔁
          </button>
        </div>
      )}
    </GameStage>
  );
}
