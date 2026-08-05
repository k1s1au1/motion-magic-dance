import { useCallback, useRef, useState } from "react";
import GameStage, { KidHud } from "./GameStage";
import { usePoseCamera, type FrameInfo } from "@/lib/usePoseCamera";
import { audio } from "@/lib/audioUtils";

type Lane = 0 | 1 | 2; // Left, Center, Right
type Obstacle = { id: number; lane: Lane; z: number; type: "barrier-low" | "barrier-high" | "train" };
type Coin = { id: number; lane: Lane; z: number };

const SPEED = 0.15;
const SPAWN_RATE = 0.02;

export default function SubwayRunner({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<"idle" | "playing" | "finished">("idle");
  const [score, setScore] = useState(0);
  const [distance, setDistance] = useState(0);

  const phaseRef = useRef<"idle" | "playing" | "finished">("idle");
  const obstacles = useRef<Obstacle[]>([]);
  const coins = useRef<Coin[]>([]);
  const nextId = useRef(0);
  const playerLane = useRef<Lane>(1);
  const playerState = useRef<"normal" | "jumping" | "ducking">("normal");
  const stateTimer = useRef(0);

  // Calibration
  const baselineY = useRef(0.5);
  const calibrated = useRef(false);

  const onFrame = useCallback(({ lm, ctx, w, h, dt, now }: FrameInfo) => {
    if (phaseRef.current !== "playing") return;

    // 1. Logic: Body Tracking
    if (lm) {
      const nose = lm[0];
      if (nose) {
        // Lane switching (mirrored x)
        const nx = 1 - nose.x;
        if (nx < 0.35) playerLane.current = 0;
        else if (nx > 0.65) playerLane.current = 2;
        else playerLane.current = 1;

        // Calibration logic
        if (!calibrated.current) {
          baselineY.current = baselineY.current * 0.95 + nose.y * 0.05;
        }

        // Jump/Duck detection
        const dy = nose.y - baselineY.current;
        if (dy < -0.12 && playerState.current === "normal") {
          playerState.current = "jumping";
          stateTimer.current = now + 600;
          audio.playJump();
        } else if (dy > 0.12 && playerState.current === "normal") {
          playerState.current = "ducking";
          stateTimer.current = now + 600;
          audio.playDuck();
        }
      }
    }

    if (now > stateTimer.current) playerState.current = "normal";

    // 2. Logic: Move Obstacles & Coins
    setDistance(d => d + SPEED);
    obstacles.current.forEach(o => o.z -= SPEED);
    coins.current.forEach(c => c.z -= SPEED);

    // Collision
    const hit = obstacles.current.find(o => o.z < 0.1 && o.z > -0.1 && o.lane === playerLane.current);
    if (hit) {
      if (hit.type === "barrier-low" && playerState.current === "jumping") {
        // safe
      } else if (hit.type === "barrier-high" && playerState.current === "ducking") {
        // safe
      } else {
        audio.playFail();
        phaseRef.current = "finished";
        setPhase("finished");
      }
    }

    // Collect coins
    const collectedIdx = coins.current.findIndex(c => c.z < 0.1 && c.z > -0.1 && c.lane === playerLane.current);
    if (collectedIdx !== -1) {
      coins.current.splice(collectedIdx, 1);
      setScore(s => s + 100);
      audio.playCoin();
    }

    // Cleanup & Spawn
    obstacles.current = obstacles.current.filter(o => o.z > -0.2);
    coins.current = coins.current.filter(c => c.z > -0.2);

    if (Math.random() < SPAWN_RATE) {
      const lane = Math.floor(Math.random() * 3) as Lane;
      const type = Math.random() > 0.5 ? "barrier-low" : "barrier-high";
      obstacles.current.push({ id: nextId.current++, lane, z: 5, type });
    }
    if (Math.random() < SPAWN_RATE * 2) {
      coins.current.push({ id: nextId.current++, lane: Math.floor(Math.random() * 3) as Lane, z: 5 });
    }

    // 3. Drawing: Advanced Pseudo-3D Tunnel
    const centerX = w / 2;
    const horizonY = h * 0.35;
    const roadW = w * 0.9;
    const tunnelH = h * 0.8;

    // Camera shake based on player state
    ctx.save();
    if (phaseRef.current === "playing") {
      const shake = Math.sin(now * 0.02) * (playerState.current !== "normal" ? 4 : 1.5);
      ctx.translate(shake, shake);
    }

    const getX = (lane: Lane, z: number) => {
      const p = 1 / z;
      const xOffset = (lane - 1) * (roadW / 3);
      return centerX + xOffset * p;
    };
    const getY = (z: number) => horizonY + (h - horizonY) * (1 / z);

    // DRAW TUNNEL BACKGROUND
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, "#050510"); // Deep dark
    skyGrad.addColorStop(0.5, "#101025");
    skyGrad.addColorStop(1, "#050510");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // Draw Perspective Tunnel Walls
    ctx.beginPath();
    ctx.moveTo(centerX - 5, horizonY);
    ctx.lineTo(centerX + 5, horizonY);
    ctx.lineTo(w, h * 0.8);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.lineTo(0, h * 0.8);
    ctx.closePath();
    ctx.fillStyle = "#1a1a2e";
    ctx.fill();

    // Ceiling Lights (Movement effect)
    const lightSpacing = 1.5;
    const lightZOffset = (distance % lightSpacing);
    ctx.fillStyle = "rgba(255, 255, 150, 0.4)";
    for (let z = 10 - lightZOffset; z > 0.5; z -= lightSpacing) {
      const p = 1 / z;
      const size = (w * 0.1) * p;
      const ly = horizonY - (tunnelH * 0.5) * p;
      ctx.beginPath();
      ctx.ellipse(centerX, ly, size * 2, size * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      // Glow on walls
      ctx.fillStyle = `rgba(100, 100, 255, ${0.1 / z})`;
      ctx.fillRect(0, getY(z), w, 2);
      ctx.fillStyle = "rgba(255, 255, 150, 0.4)";
    }

    // Track Ties (Sleeper)
    const tieSpacing = 0.4;
    const tieZOffset = (distance % tieSpacing);
    ctx.fillStyle = "#333";
    for (let z = 6 - tieZOffset; z > 0.5; z -= tieSpacing) {
      const p = 1 / z;
      const tw = roadW * p;
      const ty = getY(z);
      const th = 4 * p;
      ctx.fillRect(centerX - tw / 2, ty, tw, th);
    }

    // Draw Tracks
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 3;
    for (let l = 0; l <= 3; l++) {
      const xBot = centerX + (l - 1.5) * (roadW / 3) * 1.5;
      ctx.beginPath();
      ctx.moveTo(centerX, horizonY);
      ctx.lineTo(xBot, h);
      ctx.stroke();
    }

    // Draw Coins
    coins.current.forEach(c => {
      if (c.z < 0.2 || c.z > 6) return;
      const x = getX(c.lane, c.z);
      const y = getY(c.z);
      const size = (w * 0.08) / c.z;

      // Animated spinning coin
      const spin = Math.sin(now * 0.01);
      ctx.save();
      ctx.translate(x, y - size);
      ctx.scale(Math.abs(spin), 1);
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, Math.PI * 2);
      ctx.fillStyle = "#FFD700";
      ctx.fill();
      ctx.strokeStyle = "#DAA520";
      ctx.lineWidth = 2;
      ctx.stroke();
      // Inner circle
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });

    // Draw Obstacles (Trains & Barriers)
    obstacles.current.sort((a,b) => b.z - a.z).forEach(o => {
      if (o.z < 0.2 || o.z > 8) return;
      const x = getX(o.lane, o.z);
      const y = getY(o.z);
      const size = (w * 0.15) / o.z;

      if (o.type === "barrier-low") {
        // 3D Barrier
        ctx.fillStyle = "#cc0000";
        ctx.fillRect(x - size, y - size, size * 2, size);
        ctx.fillStyle = "#990000";
        ctx.fillRect(x - size, y - size * 0.2, size * 2, size * 0.2);
        // Stripes
        ctx.fillStyle = "#fff";
        for (let i = -1; i < 1; i += 0.5) {
          ctx.fillRect(x + i * size, y - size, size * 0.2, size);
        }
      } else {
        // Subway Train Car
        const trainH = size * 3.5;
        const grad = ctx.createLinearGradient(x - size, 0, x + size, 0);
        grad.addColorStop(0, "#2c3e50");
        grad.addColorStop(0.5, "#34495e");
        grad.addColorStop(1, "#2c3e50");
        ctx.fillStyle = grad;
        ctx.fillRect(x - size, y - trainH, size * 2, trainH);

        // Windows
        ctx.fillStyle = "rgba(100, 200, 255, 0.6)";
        ctx.fillRect(x - size * 0.7, y - trainH * 0.7, size * 1.4, size * 0.5);

        // Front Lights
        ctx.fillStyle = "#ffffaa";
        ctx.shadowBlur = 20;
        ctx.shadowColor = "#ffff00";
        ctx.beginPath();
        ctx.arc(x - size * 0.6, y - size * 0.5, size * 0.2, 0, Math.PI * 2);
        ctx.arc(x + size * 0.6, y - size * 0.5, size * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    });

    // Draw Player Indicator (Mirrored Body Skeleton hint)
    const px = centerX + (playerLane.current - 1) * (roadW / 5);
    const py = h * 0.82;
    ctx.font = `${w * 0.2}px system-ui`;
    ctx.textAlign = "center";
    let emoji = "🏃";
    if (playerState.current === "jumping") emoji = "🚀";
    if (playerState.current === "ducking") emoji = "👇";

    // Draw "Shadow" under player
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(px, h * 0.92, w * 0.1, w * 0.03, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillText(emoji, px, py);

    // Speed lines effect
    if (phaseRef.current === "playing") {
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const sx = Math.random() * w;
        const sy = Math.random() * h;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + (sx - centerX) * 0.1, sy + (sy - horizonY) * 0.1);
        ctx.stroke();
      }
    }

    ctx.restore();

  }, []);

  const { videoRef, canvasRef, start, status, error } = usePoseCamera(onFrame, "hsl(45 100% 60%)");

  const play = async () => {
    calibrated.current = false;
    setTimeout(() => calibrated.current = true, 2000);
    await start();
    setScore(0);
    setDistance(0);
    obstacles.current = [];
    coins.current = [];
    phaseRef.current = "playing";
    setPhase("playing");
  };

  return (
    <GameStage
      videoRef={videoRef}
      canvasRef={canvasRef}
      title="مغامرة المترو"
      emoji="🏃"
      onBack={onBack}
      hud={
        phase === "playing" ? (
          <>
            <KidHud label="النقاط" value={score.toLocaleString("ar-EG")} />
            <KidHud label="المسافة" value={`${Math.floor(distance)}م`} />
          </>
        ) : null
      }
    >
      {phase === "idle" && (
        <div className="text-center">
          <h2 className="kid-title text-3xl">مغامرة المترو 🏃</h2>
          <p className="mt-2 text-sm text-muted-foreground">اركض في مكانك، وانقز أو انزل عشان تتفادى الحواجز!</p>
          <button onClick={play} disabled={status === "loading"} className="btn-kid mt-5 w-full">
            {status === "loading" ? "جاري التجهيز…" : "يلا نركض!"}
          </button>
        </div>
      )}
      {phase === "finished" && (
        <div className="text-center">
          <h2 className="kid-title text-3xl">اصطدمت! 💥</h2>
          <p className="mt-2 text-lg font-bold">{score.toLocaleString("ar-EG")} نقطة</p>
          <button onClick={play} className="btn-kid mt-5 w-full">
            حاول مرة ثانية 🔁
          </button>
        </div>
      )}
    </GameStage>
  );
}
