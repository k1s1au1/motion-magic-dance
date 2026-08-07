import { useCallback, useEffect, useRef, useState } from "react";
import GameStage, { KidHud } from "./GameStage";
import { mirrored, usePoseCamera, type FrameInfo } from "@/lib/usePoseCamera";
import { L } from "@/lib/dance";
import { audio } from "@/lib/audioUtils";

type Star = { x: number; y: number; vy: number; kind: "star" | "bomb"; r: number; rotation: number; trail: {x: number, y: number}[] };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number; glow: boolean };

const GAME_MS = 60000;

export default function StarCatcher({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<"idle" | "calibrating" | "playing" | "finished">("idle");
  const [score, setScore] = useState(0);
  const [caught, setCaught] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const phaseRef = useRef<"idle" | "calibrating" | "playing" | "finished">("idle");
  const items = useRef<Star[]>([]);
  const spawnAt = useRef(0);
  const endAt = useRef(0);
  const particles = useRef<Particle[]>([]);
  const flashOpacity = useRef(0);
  const nebulaPhase = useRef(0);
  const calibrationTimer = useRef(0);

  const spawnParticles = (x: number, y: number, color: string, count = 15, glow = true) => {
    for (let i = 0; i < count; i++) {
      particles.current.push({
        x, y, vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.5) * 12,
        life: 1, color, size: Math.random() * 5 + 2, glow
      });
    }
  };

  const onFrame = useCallback(({ lm, ctx, w, h, dt, now, visible: poseOk }: FrameInfo) => {
    const isCalibrating = phaseRef.current === "calibrating";
    const isPlaying = phaseRef.current === "playing";

    // 1. NEBULA SPACE BACKGROUND
    nebulaPhase.current += 0.005;
    const bgGrad = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w);
    bgGrad.addColorStop(0, `hsl(${260 + Math.sin(nebulaPhase.current)*40}, 80%, 10%)`);
    bgGrad.addColorStop(1, "#050510");
    ctx.fillStyle = bgGrad; ctx.fillRect(0,0,w,h);

    // ... background stars ...
    ctx.fillStyle = "white";
    for(let i=0; i<30; i++) {
        const sx = (Math.sin(i*10)*0.5+0.5)*w, sy = ((i*20 + now*0.02) % h);
        ctx.globalAlpha = 0.2;
        ctx.beginPath(); ctx.arc(sx, sy, 1, 0, Math.PI*2); ctx.fill();
    }

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
        phaseRef.current = "finished"; setPhase("finished");
      }
      if (now >= spawnAt.current) {
        spawnAt.current = now + 600 + Math.random() * 400;
        items.current.push({
          x: 0.1 + Math.random() * 0.8, y: -0.1,
          vy: 0.2 + Math.random() * 0.15, kind: Math.random() < 0.2 ? "bomb" : "star",
          r: 0.08, rotation: 0, trail: []
        });
      }
    }
    // ...

    const hands = [mirrored(lm?.[L.lWrist]), mirrored(lm?.[L.rWrist])].filter(Boolean) as { x: number; y: number }[];
    flashOpacity.current *= 0.9;

    // 2. LOGIC
    items.current = items.current.filter((it) => {
      it.y += it.vy * dt; it.rotation += dt * 5;
      it.trail.push({x: it.x, y: it.y}); if (it.trail.length > 15) it.trail.shift();

      let hit = false;
      if (phaseRef.current === "playing") {
        for (const hnd of hands) {
          if (Math.hypot(hnd.x - it.x, (hnd.y - it.y) * (h / w)) < it.r) { hit = true; break; }
        }
      }
      if (hit) {
        if (it.kind === "star") {
          setScore((s) => s + 150); setCaught((c) => c + 1); audio.playCoin(); audio.speak("نجمة!", { cooldown: 2500 });
          flashOpacity.current = 0.4; spawnParticles(it.x * w, it.y * h, "#fff5a0", 25);
        } else {
          setScore((s) => Math.max(0, s - 100)); audio.playFail(); audio.speak("احذر القنبلة!", { cooldown: 2000 });
          spawnParticles(it.x * w, it.y * h, "#ff4444", 30, false);
        }
        return false;
      }
      return it.y < 1.2;
    });

    // 3. DRAWING (Extreme Rendering)
    items.current.forEach(it => {
      const px = it.x * w, py = it.y * h, r = it.r * w;
      if (it.kind === "star") {
        // Supernova Trail
        ctx.save(); ctx.lineCap = "round";
        it.trail.forEach((pos, i) => {
          const size = (i / it.trail.length) * r * 0.6;
          ctx.globalAlpha = (i / it.trail.length) * 0.4;
          ctx.fillStyle = "gold";
          ctx.beginPath(); ctx.arc(pos.x * w, pos.y * h, size, 0, Math.PI*2); ctx.fill();
        });
        ctx.restore();

        // Pulsing Star
        ctx.save(); ctx.translate(px, py); ctx.rotate(it.rotation);
        ctx.shadowColor = "gold"; ctx.shadowBlur = 40; ctx.fillStyle = "#fff";
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const angle = (i * 45 * Math.PI) / 180;
          const outer = r * (1 + Math.sin(now*0.01)*0.2);
          ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
          ctx.lineTo(Math.cos(angle + Math.PI/8) * r * 0.3, Math.sin(angle + Math.PI/8) * r * 0.3);
        }
        ctx.closePath(); ctx.fill();
        ctx.restore();
      } else {
        // SWIRLING BLACK HOLE BOMB
        ctx.save(); ctx.translate(px, py);
        const swirl = now * 0.01;
        ctx.rotate(swirl);
        const bGrad = ctx.createRadialGradient(0,0,0, 0,0,r);
        bGrad.addColorStop(0, "black"); bGrad.addColorStop(0.7, "#1a0033"); bGrad.addColorStop(1, "#ff00ff");
        ctx.fillStyle = bGrad; ctx.shadowBlur = 30; ctx.shadowColor = "#ff00ff";
        ctx.beginPath(); ctx.arc(0,0, r*0.9, 0, Math.PI*2); ctx.fill();

        // Swirl Particles
        ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 2;
        for(let i=0; i<4; i++) {
          ctx.beginPath(); ctx.arc(0,0, r*(0.5 + i*0.1), swirl + i, swirl + i + 1); ctx.stroke();
        }
        ctx.restore();
      }
    });

    // 4. VFX PARTICLES
    particles.current.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.life -= 0.02;
      ctx.save(); ctx.globalAlpha = p.life;
      if(p.glow) { ctx.shadowBlur = 15; ctx.shadowColor = p.color; }
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    });
    particles.current = particles.current.filter(p => p.life > 0);

    // Light Burst
    if (flashOpacity.current > 0.01) {
      ctx.fillStyle = `rgba(255, 255, 255, ${flashOpacity.current})`; ctx.fillRect(0, 0, w, h);
    }

    // Advanced Hand Halos
    hands.forEach(hnd => {
      ctx.save();
      const hx = hnd.x*w, hy = hnd.y*h;
      const hPulse = 1 + Math.sin(now * 0.01) * 0.3;
      const hGrad = ctx.createRadialGradient(hx, hy, 0, hx, hy, 0.15*w);
      hGrad.addColorStop(0, "rgba(200, 255, 255, 0.6)"); hGrad.addColorStop(1, "transparent");
      ctx.fillStyle = hGrad; ctx.beginPath(); ctx.arc(hx, hy, 0.12 * w * hPulse, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    });
  }, []);

  const { videoRef, canvasRef, start, status, error, visible } = usePoseCamera((f) => onFrame(f), "rgba(0, 255, 255, 0.3)");

  useEffect(() => { return () => { audio.stopMusic(); }; }, []);

  const play = async () => {
    calibrationTimer.current = 0;
    await start();
    setPhaseBoth("calibrating");
  };

  const startPlaying = () => {
    if (phaseRef.current === "playing") return;
    items.current = []; particles.current = []; flashOpacity.current = 0;
    setScore(0); setCaught(0); setTimeLeft(60);
    spawnAt.current = performance.now(); endAt.current = performance.now() + GAME_MS;
    phaseRef.current = "playing"; setPhase("playing"); audio.startKidsMusic(140); audio.speak("امسك النجوم!", { force: true });
  };

  const setPhaseBoth = (p: typeof phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  return (
    <GameStage
      videoRef={videoRef} canvasRef={canvasRef} title="فضاء النجوم" emoji="⭐" onBack={onBack}
      isCalibrating={phase === "calibrating"}
      isPoseVisible={visible}
      hud={phase === "playing" ? (
        <>
          <KidHud label="النقاط" value={score.toLocaleString("ar-EG")} />
          <KidHud label="الوقت" value={`${timeLeft}ث`} />
        </>
      ) : null}
    >
      {phase === "idle" && (
        <div className="text-center">
          <h2 className="kid-title text-3xl font-black">فضاء النجوم 🌌🚀</h2>
          <p className="mt-2 text-sm text-muted-foreground">اجمع النجوم الذهبية وتجنب الثقوب السوداء! جاهز للإنطلاق؟</p>
          <button onClick={play} disabled={status === "loading"} className="btn-kid mt-5 w-full shadow-2xl">
            {status === "loading" ? "تجهيز الصاروخ…" : "إلى الفضاء! 🌠"}
          </button>
        </div>
      )}
      {phase === "finished" && (
        <div className="text-center">
          <h2 className="kid-title text-4xl">رائد فضاء مبدع! 👨‍🚀</h2>
          <p className="mt-2 text-2xl font-bold text-cyan-400">{score.toLocaleString("ar-EG")} نقطة كونية</p>
          <button onClick={play} className="btn-kid mt-5 w-full">رحلة جديدة 🔁</button>
        </div>
      )}
    </GameStage>
  );
}
