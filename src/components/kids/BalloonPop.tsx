import { useCallback, useEffect, useRef, useState } from "react";
import GameStage, { KidHud } from "./GameStage";
import { mirrored, usePoseCamera, type FrameInfo } from "@/lib/usePoseCamera";
import { L } from "@/lib/dance";
import { audio } from "@/lib/audioUtils";

type Balloon = { x: number; y: number; vy: number; drift: number; color: string; r: number; phase: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number };

const COLORS = ["#ff4d4d", "#4dff4d", "#4d4dff", "#ffff4d", "#ff4dff", "#4dffff"];
const GAME_MS = 60000;

export default function BalloonPop({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<"idle" | "playing" | "finished">("idle");
  const [popped, setPopped] = useState(0);
  const [missed, setMissed] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const phaseRef = useRef<"idle" | "playing" | "finished">("idle");
  const items = useRef<Balloon[]>([]);
  const particles = useRef<Particle[]>([]);
  const spawnAt = useRef(0);
  const endAt = useRef(0);

  const spawnParticles = (x: number, y: number, color: string) => {
    for (let i = 0; i < 20; i++) {
      particles.current.push({
        x, y,
        vx: (Math.random() - 0.5) * 15,
        vy: (Math.random() - 0.5) * 15,
        life: 1,
        color,
        size: Math.random() * 6 + 2
      });
    }
  };

  const onFrame = useCallback(({ lm, ctx, w, h, dt, now }: FrameInfo) => {
    if (phaseRef.current === "playing") {
      setTimeLeft(Math.max(0, Math.ceil((endAt.current - now) / 1000)));
      if (now >= endAt.current) {
        phaseRef.current = "finished";
        setPhase("finished");
        audio.stopMusic();
      }
      if (now >= spawnAt.current) {
        spawnAt.current = now + 650 + Math.random() * 450;
        items.current.push({
          x: 0.12 + Math.random() * 0.76,
          y: 1.12,
          vy: 0.14 + Math.random() * 0.1,
          drift: (Math.random() - 0.5) * 0.06,
          color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? "#ff0000",
          r: 0.08,
          phase: Math.random() * Math.PI * 2
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
            spawnParticles(b.x * w, b.y * h, b.color);
            setPopped((p) => p + 1);
            audio.playPop();
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
      const bx = b.x * w;
      const by = b.y * h;
      const br = b.r * w;

      ctx.save();
      // Draw String
      ctx.beginPath();
      ctx.moveTo(bx, by + br);
      for (let i = 0; i < 10; i++) {
        const sy = by + br + i * (br * 0.2);
        const sx = bx + Math.sin(now * 0.01 + i * 0.5 + b.phase) * 5;
        ctx.lineTo(sx, sy);
      }
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw Balloon (3D shaded)
      const grad = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.3, br * 0.1, bx, by, br);
      grad.addColorStop(0, "white");
      grad.addColorStop(0.2, b.color);
      grad.addColorStop(1, "rgba(0,0,0,0.3)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(bx, by, br * 0.85, br, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Update & Draw Particles
    particles.current.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.life -= 0.03;
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    });
    particles.current = particles.current.filter(p => p.life > 0);
    ctx.globalAlpha = 1;

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

  useEffect(() => {
    return () => {
      audio.stopMusic();
    };
  }, []);

  const play = async () => {
    await start();
    items.current = [];
    particles.current = [];
    setPopped(0);
    setMissed(0);
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
