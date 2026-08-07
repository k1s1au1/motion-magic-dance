import { useCallback, useEffect, useRef, useState } from "react";
import GameStage, { KidHud } from "./GameStage";
import { mirrored, usePoseCamera, type FrameInfo } from "@/lib/usePoseCamera";
import { L } from "@/lib/dance";
import { audio } from "@/lib/audioUtils";

type Balloon = { x: number; y: number; vy: number; drift: number; color: string; r: number; phase: number; wobble: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number; rotation: number; dr: number; type: 'confetti' | 'spark' };

const COLORS = ["#ff3366", "#33ff77", "#3366ff", "#ffff33", "#ff33ff", "#33ffff", "#ff9933"];
const GAME_MS = 60000;

export default function BalloonPop({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<"idle" | "calibrating" | "playing" | "finished">("idle");
  const [popped, setPopped] = useState(0);
  const [missed, setMissed] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const phaseRef = useRef<"idle" | "calibrating" | "playing" | "finished">("idle");
  const items = useRef<Balloon[]>([]);
  const particles = useRef<Particle[]>([]);
  const clouds = useRef<{x: number, y: number, s: number, v: number}[]>([]);
  const spawnAt = useRef(0);
  const endAt = useRef(0);
  const calibrationTimer = useRef(0);

  const spawnParticles = (x: number, y: number, color: string) => {
    // Confetti
    for (let i = 0; i < 25; i++) {
      particles.current.push({
        x, y, vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.5) * 12,
        life: 1, color: COLORS[Math.floor(Math.random()*COLORS.length)]!,
        size: Math.random() * 8 + 4, rotation: Math.random() * Math.PI, dr: (Math.random()-0.5)*0.2,
        type: 'confetti'
      });
    }
    // Sparks
    for (let i = 0; i < 15; i++) {
      particles.current.push({
        x, y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20,
        life: 1, color: "white", size: Math.random() * 3 + 1, rotation: 0, dr: 0,
        type: 'spark'
      });
    }
  };

  const onFrame = useCallback(({ lm, ctx, w, h, dt, now, visible: poseOk }: FrameInfo) => {
    const isCalibrating = phaseRef.current === "calibrating";
    const isPlaying = phaseRef.current === "playing";

    // 1. CLOUDS PARALLAX BACKGROUND
    if (clouds.current.length === 0) {
      for(let i=0; i<10; i++) clouds.current.push({x: Math.random()*w, y: Math.random()*h*0.4, s: 40 + Math.random()*80, v: 0.2 + Math.random()*0.5});
    }
    ctx.fillStyle = "#87ceeb"; // Sky
    ctx.fillRect(0,0,w,h);

    // Draw Clouds
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    clouds.current.forEach(c => {
      c.x += c.v; if(c.x > w+c.s) c.x = -c.s;
      ctx.beginPath(); ctx.arc(c.x, c.y, c.s, 0, Math.PI*2); ctx.arc(c.x+c.s*0.6, c.y-c.s*0.2, c.s*0.8, 0, Math.PI*2); ctx.fill();
    });

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

    if (isPlaying) {
      setTimeLeft(Math.max(0, Math.ceil((endAt.current - now) / 1000)));
      if (now >= endAt.current) {
        phaseRef.current = "finished"; setPhase("finished"); audio.stopMusic();
      }
      if (now >= spawnAt.current) {
        spawnAt.current = now + 500 + Math.random() * 400;
        items.current.push({
          x: 0.15 + Math.random() * 0.7, y: 1.15,
          vy: 0.18 + Math.random() * 0.12, drift: (Math.random() - 0.5) * 0.08,
          color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? "red",
          r: 0.08, phase: Math.random() * Math.PI * 2, wobble: 0
        });
      }
    }

    const hands = [mirrored(lm?.[L.lWrist]), mirrored(lm?.[L.rWrist])].filter(Boolean) as { x: number; y: number }[];

    // 2. LOGIC & PHYSICS
    items.current = items.current.filter((b) => {
      b.y -= b.vy * dt; b.x += b.drift * dt;
      b.wobble = Math.sin(now * 0.01 + b.phase) * 0.08;

      if (phaseRef.current === "playing") {
        for (const hnd of hands) {
          if (Math.hypot(hnd.x - b.x, (hnd.y - b.y) * (h / w)) < b.r * 1.1) {
            spawnParticles(b.x * w, b.y * h, b.color);
            setPopped((p) => p + 1); audio.playPop(); return false;
          }
        }
      }
      return b.y > -0.2;
    });

    // 3. DRAW BALLOONS (Extreme Rendering)
    items.current.forEach(b => {
      const bx = b.x * w, by = b.y * h, br = b.r * w;
      ctx.save();

      // Dynamic String with Physics Curve
      ctx.beginPath(); ctx.moveTo(bx, by + br);
      let prevX = bx, prevY = by + br;
      for (let i = 1; i < 12; i++) {
        const curY = by + br + i * (br * 0.25);
        const curX = bx + Math.sin(now * 0.008 + i * 0.6 + b.phase) * (i * 1.5);
        ctx.quadraticCurveTo(prevX, prevY, curX, curY);
        prevX = curX; prevY = curY;
      }
      ctx.strokeStyle = "rgba(255, 255, 255, 0.6)"; ctx.lineWidth = 3; ctx.stroke();

      // Balloon Deformation (Squash & Stretch)
      ctx.translate(bx, by);
      ctx.rotate(b.wobble);

      // High-End Radial Gradient
      const grad = ctx.createRadialGradient(-br*0.3, -br*0.4, br*0.1, 0, 0, br);
      grad.addColorStop(0, "rgba(255,255,255,0.9)");
      grad.addColorStop(0.3, b.color);
      grad.addColorStop(0.8, b.color);
      grad.addColorStop(1, "rgba(0,0,0,0.4)");

      ctx.fillStyle = grad;
      ctx.shadowBlur = 30; ctx.shadowColor = b.color;
      ctx.beginPath(); ctx.ellipse(0, 0, br * 0.85, br * (1 + Math.abs(b.wobble)), 0, 0, Math.PI * 2); ctx.fill();

      // Specular Reflection (Bloom)
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath(); ctx.ellipse(-br*0.3, -br*0.4, br*0.2, br*0.3, Math.PI/4, 0, Math.PI*2); ctx.fill();

      ctx.restore();
    });

    // 4. PARTICLES (Extreme Confetti + Sparks)
    particles.current.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.2; // Gravity
      p.life -= 0.02; p.rotation += p.dr;
      ctx.save();
      ctx.globalAlpha = p.life; ctx.translate(p.x, p.y);
      if(p.type === 'confetti') {
        ctx.rotate(p.rotation); ctx.fillStyle = p.color;
        ctx.fillRect(-p.size/2, -p.size/4, p.size, p.size/2);
      } else {
        ctx.shadowBlur = 10; ctx.shadowColor = "white"; ctx.fillStyle = "white";
        ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();
    });
    particles.current = particles.current.filter(p => p.life > 0);

    // Hand Halos
    hands.forEach(hnd => {
      ctx.save();
      const pulse = 1 + Math.sin(now * 0.01) * 0.2;
      const hGrad = ctx.createRadialGradient(hnd.x*w, hnd.y*h, 0, hnd.x*w, hnd.y*h, 0.1*w);
      hGrad.addColorStop(0, "rgba(255, 255, 255, 0.5)"); hGrad.addColorStop(1, "transparent");
      ctx.fillStyle = hGrad;
      ctx.beginPath(); ctx.arc(hnd.x*w, hnd.y*h, 0.08 * w * pulse, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    });
  }, []);

  const { videoRef, canvasRef, start, status, error, visible } = usePoseCamera((f) => onFrame(f), "rgba(255, 255, 255, 0.4)");

  useEffect(() => { return () => { audio.stopMusic(); }; }, []);

  const play = async () => {
    calibrationTimer.current = 0;
    await start();
    setPhaseBoth("calibrating");
  };

  const startPlaying = () => {
    if (phaseRef.current === "playing") return;
    items.current = []; particles.current = [];
    setPopped(0); setMissed(0); setTimeLeft(60);
    spawnAt.current = performance.now(); endAt.current = performance.now() + GAME_MS;
    phaseRef.current = "playing"; setPhase("playing"); audio.startKidsMusic();
  };

  const setPhaseBoth = (p: typeof phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  return (
    <GameStage
      videoRef={videoRef} canvasRef={canvasRef} title="كرنفال البالونات" emoji="🎈" onBack={onBack}
      isCalibrating={phase === "calibrating"}
      isPoseVisible={visible}
      hud={phase === "playing" ? (
        <>
          <KidHud label="فُرقِعت" value={`${popped}`} />
          <KidHud label="الوقت" value={`${timeLeft}ث`} />
        </>
      ) : null}
    >
      {phase === "idle" && (
        <div className="text-center">
          <h2 className="kid-title text-3xl font-black">كرنفال البالونات 🎡🎈</h2>
          <p className="mt-2 text-sm text-muted-foreground">استعد لأكبر مهرجان فرقعة في التاريخ! الكاميرا جاهزة؟</p>
          <button onClick={play} disabled={status === "loading"} className="btn-kid mt-5 w-full shadow-xl">
            {status === "loading" ? "نفخ البالونات…" : "ابدأ الكرنفال! 🎉"}
          </button>
        </div>
      )}
      {phase === "finished" && (
        <div className="text-center">
          <h2 className="kid-title text-4xl">بطل الكرنفال! 🏆</h2>
          <p className="mt-2 text-2xl font-bold text-pink-500">{popped} بالون مفجر</p>
          <button onClick={play} className="btn-kid mt-5 w-full">العب مرة أخرى 🔁</button>
        </div>
      )}
    </GameStage>
  );
}
