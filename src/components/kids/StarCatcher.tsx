import { useCallback, useEffect, useRef, useState } from "react";
import GameStage, { KidHud } from "./GameStage";
import { mirrored, usePoseCamera, type FrameInfo } from "@/lib/usePoseCamera";
import { L } from "@/lib/dance";
import { audio } from "@/lib/audioUtils";

type Star = { x: number; y: number; vy: number; kind: "star" | "bomb"; r: number; rotation: number; trail: {x: number, y: number}[] };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number };

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
  const particles = useRef<Particle[]>([]);
  const flashOpacity = useRef(0);
  const popRef = useRef<{ x: number; y: number; t: number; kind: Star["kind"] }[]>([]);

  const spawnParticles = (x: number, y: number, color: string, count = 10) => {
    for (let i = 0; i < count; i++) {
      particles.current.push({
        x, y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1,
        color,
        size: Math.random() * 4 + 1
      });
    }
  };

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
          rotation: 0,
          trail: []
        });
      }
    }

    const hands = [mirrored(lm?.[L.lWrist]), mirrored(lm?.[L.rWrist])].filter(Boolean) as { x: number; y: number }[];

    flashOpacity.current *= 0.9;

    items.current = items.current.filter((it) => {
      it.y += it.vy * dt;
      it.rotation += dt * 2;
      it.trail.push({x: it.x, y: it.y});
      if (it.trail.length > 8) it.trail.shift();

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
        if (it.kind === "star") {
          setScore((s) => s + 100);
          setCaught((c) => c + 1);
          audio.playCoin();
          flashOpacity.current = 0.3;
          spawnParticles(it.x * w, it.y * h, "gold", 15);
        } else {
          setScore((s) => Math.max(0, s - 50));
          audio.playFail();
          spawnParticles(it.x * w, it.y * h, "#333", 20);
        }
        return false;
      }
      return it.y < 1.15;
    });

    // Draw Falling Items
    for (const it of items.current) {
      const px = it.x * w;
      const py = it.y * h;
      const r = it.r * w;

      if (it.kind === "star") {
        // Star Trail
        ctx.beginPath();
        it.trail.forEach((pos, i) => {
          ctx.lineTo(pos.x * w, pos.y * h);
        });
        ctx.strokeStyle = `rgba(255, 215, 0, 0.3)`;
        ctx.lineWidth = r * 0.5;
        ctx.lineCap = "round";
        ctx.stroke();

        // Glowing Star
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(it.rotation);
        ctx.shadowColor = "gold";
        ctx.shadowBlur = 20;
        ctx.fillStyle = "gold";
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          ctx.lineTo(Math.cos((i * 72 * Math.PI) / 180) * r, Math.sin((i * 72 * Math.PI) / 180) * r);
          ctx.lineTo(Math.cos(((i * 72 + 36) * Math.PI) / 180) * (r * 0.4), Math.sin(((i * 72 + 36) * Math.PI) / 180) * (r * 0.4));
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        // Pulsing Bomb
        const pulse = 1 + Math.sin(now * 0.01) * 0.1;
        ctx.save();
        ctx.translate(px, py);
        ctx.scale(pulse, pulse);

        // Smoke
        if (Math.random() < 0.3) spawnParticles(px, py, "#333", 1);

        ctx.fillStyle = "black";
        ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "red";
        ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.3, r * 0.2, 0, Math.PI * 2); ctx.fill(); // Highlight
        ctx.strokeStyle = "#444";
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(0, -r * 0.8); ctx.quadraticCurveTo(r * 0.5, -r * 1.2, r * 0.8, -r * 0.8); ctx.stroke(); // Fuse
        ctx.restore();
      }
    }

    // Update & Draw Particles
    particles.current.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.life -= 0.02;
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    });
    particles.current = particles.current.filter(p => p.life > 0);
    ctx.globalAlpha = 1;

    // Light Burst Flash
    if (flashOpacity.current > 0.01) {
      ctx.fillStyle = `rgba(255, 255, 255, ${flashOpacity.current})`;
      ctx.fillRect(0, 0, w, h);
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
    particles.current = [];
    flashOpacity.current = 0;
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
