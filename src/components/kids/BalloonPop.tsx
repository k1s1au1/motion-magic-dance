import { useCallback, useRef, useState } from "react";
import GameStage, { KidHud } from "./GameStage";
import { mirrored, usePoseCamera, type FrameInfo } from "@/lib/usePoseCamera";
import { L } from "@/lib/dance";

type Balloon = { x: number; y: number; vy: number; drift: number; emoji: string; r: number };

const BALLOONS = ["🎈", "🟣", "🔵", "🟢", "🟡"];
const GAME_MS = 60000;

export default function BalloonPop({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<"idle" | "playing" | "finished">("idle");
  const [popped, setPopped] = useState(0);
  const [missed, setMissed] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const phaseRef = useRef<"idle" | "playing" | "finished">("idle");
  const items = useRef<Balloon[]>([]);
  const bursts = useRef<{ x: number; y: number; t: number }[]>([]);
  const spawnAt = useRef(0);
  const endAt = useRef(0);

  const onFrame = useCallback(({ lm, ctx, w, h, dt, now }: FrameInfo) => {
    if (phaseRef.current === "playing") {
      setTimeLeft(Math.max(0, Math.ceil((endAt.current - now) / 1000)));
      if (now >= endAt.current) {
        phaseRef.current = "finished";
        setPhase("finished");
      }
      if (now >= spawnAt.current) {
        spawnAt.current = now + 650 + Math.random() * 450;
        items.current.push({
          x: 0.12 + Math.random() * 0.76,
          y: 1.12,
          vy: 0.14 + Math.random() * 0.1,
          drift: (Math.random() - 0.5) * 0.06,
          emoji: BALLOONS[Math.floor(Math.random() * BALLOONS.length)] ?? "🎈",
          r: 0.08,
        });
      }
    }

    const hands = [mirrored(lm?.[L.lWrist]), mirrored(lm?.[L.rWrist])].filter(Boolean) as { x: number; y: number }[];

    items.current = items.current.filter((b) => {
      b.y -= b.vy * dt;
      b.x += b.drift * dt;
      if (phaseRef.current === "playing") {
        for (const hnd of hands) {
          if (Math.hypot(hnd.x - b.x, (hnd.y - b.y) * (h / w)) < b.r) {
            bursts.current.push({ x: b.x, y: b.y, t: now });
            setPopped((p) => p + 1);
            return false;
          }
        }
      }
      if (b.y < -0.15) {
        if (phaseRef.current === "playing") setMissed((m) => m + 1);
        return false;
      }
      return true;
    });

    for (const b of items.current) {
      ctx.save();
      ctx.font = `${b.r * w * 1.7}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "hsl(320 100% 70%)";
      ctx.shadowBlur = 18;
      ctx.fillText(b.emoji, b.x * w, b.y * h);
      ctx.restore();
    }

    bursts.current = bursts.current.filter((p) => now - p.t < 450);
    for (const p of bursts.current) {
      const k = (now - p.t) / 450;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.font = `${(0.07 + k * 0.07) * w * 1.6}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("💥", p.x * w, p.y * h);
      ctx.restore();
    }

    for (const hnd of hands) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(hnd.x * w, hnd.y * h, 0.06 * w, 0, Math.PI * 2);
      ctx.fillStyle = "hsl(320 100% 70% / 0.25)";
      ctx.fill();
      ctx.restore();
    }
  }, []);

  const { videoRef, canvasRef, start, status, error, visible } = usePoseCamera(onFrame, "hsl(320 100% 75%)");

  const play = async () => {
    await start();
    items.current = [];
    bursts.current = [];
    setPopped(0);
    setMissed(0);
    setTimeLeft(60);
    spawnAt.current = performance.now();
    endAt.current = performance.now() + GAME_MS;
    phaseRef.current = "playing";
    setPhase("playing");
  };

  return (
    <GameStage
      videoRef={videoRef}
      canvasRef={canvasRef}
      title="فرقعة البالونات"
      emoji="🎈"
      onBack={onBack}
      hud={
        phase === "playing" ? (
          <>
            <KidHud label="بالونات" value={`${popped}`} />
            <KidHud label="الوقت" value={`${timeLeft}`} />
          </>
        ) : null
      }
    >
      {phase === "idle" && (
        <div className="text-center">
          <h2 className="kid-title text-3xl">فرقعة البالونات 🎈</h2>
          <p className="mt-2 text-sm text-muted-foreground">البالونات تطير للأعلى… المسها بيديك قبل ما تهرب!</p>
          {error && <p className="mt-3 text-sm text-[var(--kid-red)]">{error}</p>}
          <button onClick={play} disabled={status === "loading"} className="btn-kid mt-5 w-full">
            {status === "loading" ? "جاري التجهيز…" : "يلا نفرقع!"}
          </button>
        </div>
      )}
      {phase === "playing" && (
        <p className="text-center text-xs text-muted-foreground">{visible ? `هربت منك: ${missed}` : "خلّي جسمك كله يبين للكاميرا 🙂"}</p>
      )}
      {phase === "finished" && (
        <div className="text-center">
          <h2 className="kid-title text-3xl">برافو! 🎉</h2>
          <p className="mt-2 text-lg font-bold">فرقعت {popped} بالون</p>
          <p className="text-sm text-muted-foreground">هربت منك: {missed}</p>
          <button onClick={play} className="btn-kid mt-5 w-full">
            العب مرة ثانية 🔁
          </button>
        </div>
      )}
    </GameStage>
  );
}
