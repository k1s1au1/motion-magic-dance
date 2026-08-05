import { useCallback, useEffect, useRef, useState } from "react";
import GameStage, { KidHud } from "./GameStage";
import { usePoseCamera, type FrameInfo } from "@/lib/usePoseCamera";
import { audio } from "@/lib/audioUtils";
import { POSE_CONNECTIONS } from "@/lib/dance";

type Lane = 0 | 1 | 2; // Left, Center, Right
type Obstacle = { id: number; lane: Lane; z: number; type: "barrier-low" | "barrier-high" | "train"; passed?: boolean };
type Coin = { id: number; lane: Lane; z: number };

const INITIAL_SPEED = 0.12;
const MAX_SPEED = 0.35;
const SPAWN_RATE = 0.025;

export default function SubwayRunner({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<"idle" | "counting" | "playing" | "finished">("idle");
  const [score, setScore] = useState(0);
  const [distance, setDistance] = useState(0);
  const [countdown, setCountdown] = useState(3);

  const phaseRef = useRef<"idle" | "counting" | "playing" | "finished">("idle");
  const obstacles = useRef<Obstacle[]>([]);
  const coins = useRef<Coin[]>([]);
  const nextId = useRef(0);
  const playerLane = useRef<Lane>(1);
  const playerState = useRef<"normal" | "jumping" | "ducking">("normal");
  const stateTimer = useRef(0);
  const currentSpeed = useRef(INITIAL_SPEED);
  const flash = useRef<{ text: string; t: number; color: string } | null>(null);

  // Calibration
  const baselineY = useRef(0.5);
  const calibrated = useRef(false);

  const onFrame = useCallback(({ lm, ctx, w, h, dt, now }: FrameInfo) => {
    const isPlaying = phaseRef.current === "playing";
    const isCounting = phaseRef.current === "counting";

    // 1. Logic: Body Tracking (Always track if possible for calibration and counting)
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
          baselineY.current = baselineY.current * 0.9 + nose.y * 0.1;
        }

        // Jump/Duck detection
        const dy = nose.y - baselineY.current;
        if (dy < -0.1 && playerState.current === "normal") {
          playerState.current = "jumping";
          stateTimer.current = now + 600;
          if (isPlaying) audio.playJump();
        } else if (dy > 0.1 && playerState.current === "normal") {
          playerState.current = "ducking";
          stateTimer.current = now + 600;
          if (isPlaying) audio.playDuck();
        }
      }
    }

    if (now > stateTimer.current) playerState.current = "normal";

    if (isPlaying) {
      // Progressive Speed
      currentSpeed.current = Math.min(MAX_SPEED, INITIAL_SPEED + (distance / 5000));
      const speed = currentSpeed.current;

      // Move Obstacles & Coins
      setDistance(d => d + speed * 10);
      obstacles.current.forEach(o => o.z -= speed);
      coins.current.forEach(c => c.z -= speed);

      // Collision & Success Feedback
      obstacles.current.forEach(o => {
        if (o.z < 0.1 && o.z > -0.1 && o.lane === playerLane.current) {
          const safeJump = o.type === "barrier-low" && playerState.current === "jumping";
          const safeDuck = o.type === "barrier-high" && playerState.current === "ducking";

          if (!safeJump && !safeDuck) {
            audio.playFail();
            audio.stopMusic();
            phaseRef.current = "finished";
            setPhase("finished");
          }
        }
        // Reward for passing obstacles
        if (o.z < -0.1 && !o.passed) {
          o.passed = true;
          setScore(s => s + 50);
          if (o.lane === playerLane.current) {
            flash.current = { text: "رائع! ⚡", t: now, color: "#4ade80" };
          }
        }
      });

      // Collect coins
      const collectedIdx = coins.current.findIndex(c => c.z < 0.15 && c.z > -0.1 && c.lane === playerLane.current);
      if (collectedIdx !== -1) {
        coins.current.splice(collectedIdx, 1);
        setScore(s => s + 200);
        audio.playCoin();
      }

      // Cleanup & Spawn
      obstacles.current = obstacles.current.filter(o => o.z > -0.2);
      coins.current = coins.current.filter(c => c.z > -0.2);

      if (Math.random() < SPAWN_RATE) {
        const lane = Math.floor(Math.random() * 3) as Lane;
        const type = Math.random() > 0.6 ? "barrier-high" : "barrier-low";
        obstacles.current.push({ id: nextId.current++, lane, z: 8, type });
      }
      if (Math.random() < SPAWN_RATE * 1.5) {
        coins.current.push({ id: nextId.current++, lane: Math.floor(Math.random() * 3) as Lane, z: 8 });
      }
    }

    // 3. Drawing: Advanced Pseudo-3D Tunnel
    const centerX = w / 2;
    const horizonY = h * 0.35;
    const roadW = w * 0.95;
    const tunnelH = h * 0.8;

    ctx.save();
    // Shake effect
    if (isPlaying) {
      const shake = Math.sin(now * 0.05) * (playerState.current !== "normal" ? 5 : 2);
      ctx.translate(shake, shake);
    }

    const getX = (lane: Lane, z: number) => {
      const p = 1 / z;
      const xOffset = (lane - 1) * (roadW / 3);
      return centerX + xOffset * p;
    };
    const getY = (z: number) => horizonY + (h - horizonY) * (1 / z);

    // DRAW BACKGROUND
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, "#020205");
    skyGrad.addColorStop(0.5, "#0a0a1a");
    skyGrad.addColorStop(1, "#020205");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // Jump/Duck Feedback Tint
    if (playerState.current === "jumping") {
      ctx.fillStyle = "rgba(251, 191, 36, 0.08)"; ctx.fillRect(0,0,w,h);
    } else if (playerState.current === "ducking") {
      ctx.fillStyle = "rgba(56, 189, 248, 0.08)"; ctx.fillRect(0,0,w,h);
    }

    // Perspective Walls
    ctx.fillStyle = "#111122";
    ctx.beginPath();
    ctx.moveTo(centerX, horizonY);
    ctx.lineTo(w, h * 0.7); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.lineTo(0, h * 0.7);
    ctx.closePath(); ctx.fill();

    // Floor Spotlight (Lane Indication)
    if (isPlaying || isCounting) {
      const sx = centerX + (playerLane.current - 1) * (roadW / 4);
      const sy = h * 0.92;
      const spotGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, w * 0.25);
      spotGrad.addColorStop(0, "rgba(255, 255, 255, 0.2)");
      spotGrad.addColorStop(1, "transparent");
      ctx.fillStyle = spotGrad;
      ctx.beginPath();
      ctx.ellipse(sx, sy, w * 0.3, w * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Side Neon Lines
    ctx.strokeStyle = "rgba(100, 100, 255, 0.3)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
        const xOffset = (i - 1.5) * (roadW / 2);
        ctx.beginPath();
        ctx.moveTo(centerX, horizonY);
        ctx.lineTo(centerX + xOffset * 2, h);
        ctx.stroke();
    }

    // Ceiling Lights & Speed Cues
    const lightSpacing = 2;
    const dist = isPlaying ? distance / 100 : now / 500;
    const lightZOffset = (dist % lightSpacing);
    for (let z = 12 - lightZOffset; z > 0.5; z -= lightSpacing) {
      const p = 1 / z;
      const size = (w * 0.15) * p;
      const ly = horizonY - (tunnelH * 0.6) * p;
      ctx.fillStyle = `rgba(255, 255, 180, ${0.4 / z})`;
      ctx.beginPath(); ctx.ellipse(centerX, ly, size * 2, size * 0.2, 0, 0, Math.PI * 2); ctx.fill();

      // Side Wall Lights
      ctx.fillStyle = `rgba(50, 50, 255, ${0.1 / z})`;
      ctx.fillRect(0, getY(z), w, 1);
    }

    // Track Ties
    const tieSpacing = 0.5;
    const tieZOffset = (dist % tieSpacing);
    ctx.fillStyle = "#222";
    for (let z = 8 - tieZOffset; z > 0.5; z -= tieSpacing) {
      const p = 1 / z;
      const tw = roadW * p;
      ctx.fillRect(centerX - tw / 2, getY(z), tw, 3 * p);
    }

    // Coins
    coins.current.forEach(c => {
      if (c.z < 0.2 || c.z > 8) return;
      const x = getX(c.lane, c.z);
      const y = getY(c.z);
      const size = (w * 0.08) / c.z;
      const spin = Math.sin(now * 0.01);
      ctx.save();
      ctx.translate(x, y - size);
      ctx.scale(Math.abs(spin), 1);
      ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI * 2);
      ctx.fillStyle = "#fbbf24"; ctx.fill();
      ctx.strokeStyle = "#d97706"; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    });

    // Obstacles
    obstacles.current.sort((a,b) => b.z - a.z).forEach(o => {
      if (o.z < 0.2 || o.z > 10) return;
      const x = getX(o.lane, o.z);
      const y = getY(o.z);
      const size = (w * 0.2) / o.z;

      ctx.save();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#fff"; // High contrast outline

      if (o.type === "barrier-low") {
        ctx.fillStyle = "#ff0000"; // Electric Red
        ctx.fillRect(x - size, y - size, size * 2, size);
        ctx.strokeRect(x - size, y - size, size * 2, size);
        // Warning stripes
        ctx.fillStyle = "#fff";
        ctx.fillRect(x - size, y - size * 0.7, size * 2, size * 0.2);
      } else {
        const trainH = size * 3.8;
        const grad = ctx.createLinearGradient(x - size, 0, x + size, 0);
        grad.addColorStop(0, "#00c3ff"); // Electric Blue
        grad.addColorStop(1, "#ffff1c"); // Yellow highlights
        ctx.fillStyle = grad;
        ctx.fillRect(x - size, y - trainH, size * 2, trainH);
        ctx.strokeRect(x - size, y - trainH, size * 2, trainH);

        ctx.fillStyle = "#fff";
        ctx.fillRect(x - size * 0.8, y - trainH * 0.8, size * 1.6, size * 0.6); // Big window

        // Front Lights (Glow)
        ctx.shadowBlur = 30;
        ctx.shadowColor = "yellow";
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(x - size * 0.6, y - size * 0.5, size * 0.25, 0, Math.PI * 2);
        ctx.arc(x + size * 0.6, y - size * 0.5, size * 0.25, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    });

    // 4. DRAW PLAYER AVATAR (Neon Skeleton)
    const px = centerX + (playerLane.current - 1) * (roadW / 4.5);
    const py = h * 0.88;

    // Shadow / Aura Background for Avatar
    ctx.save();
    ctx.shadowBlur = 40;
    ctx.shadowColor = playerState.current === "jumping" ? "#fbbf24" : playerState.current === "ducking" ? "#38bdf8" : "rgba(255,255,255,0.2)";
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath(); ctx.ellipse(px, h * 0.94, w * 0.15, w * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    if (lm) {
      // Draw a mini neon skeleton that mirrors the user
      const avatarScale = w * 0.35;
      const avatarX = px;
      const avatarY = py - (playerState.current === "jumping" ? h * 0.25 : 0); // EXAGGERATED JUMP

      const neonColor = playerState.current === "jumping" ? "#fbbf24" : playerState.current === "ducking" ? "#38bdf8" : "#fff";

      // Draw Status Icon
      if (playerState.current !== "normal") {
        ctx.font = `bold ${w * 0.12}px system-ui`;
        ctx.fillStyle = neonColor;
        ctx.fillText(playerState.current === "jumping" ? "⬆️" : "⬇️", px + w * 0.2, avatarY - h * 0.1);
      }

      ctx.save();
      ctx.translate(avatarX, avatarY);
      ctx.strokeStyle = neonColor;
      ctx.shadowColor = neonColor;
      ctx.shadowBlur = 25;
      ctx.lineWidth = 10; // THICKER LINES
      ctx.lineCap = "round";

      // Draw simplified skeleton based on lm
      const p_v = (i: number) => ({ x: (0.5 - lm[i].x) * avatarScale, y: (lm[i].y - baselineY.current) * avatarScale });

      const connections: [number, number][] = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23,25], [24,26]];
      connections.forEach(([a, b]) => {
        const p1 = p_v(a), p2 = p_v(b);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      });
      // Head
      const head = p_v(0);
      ctx.beginPath(); ctx.arc(head.x, head.y, avatarScale * 0.15, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else {
      ctx.font = `${w * 0.25}px system-ui`; ctx.textAlign = "center"; ctx.fillText("🏃", px, py);
    }

    // Feedback Flash
    if (flash.current && now - flash.current.t < 800) {
      ctx.save();
      ctx.globalAlpha = 1 - (now - flash.current.t) / 800;
      ctx.fillStyle = flash.current.color;
      ctx.font = `bold ${w * 0.1}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(flash.current.text, w / 2, h * 0.5);
      ctx.restore();
    }

    // Countdown Overlay
    if (isCounting) {
      ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#fff"; ctx.font = `bold ${w * 0.4}px system-ui`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(countdown.toString(), w / 2, h / 2);
    }

    ctx.restore();
  }, [countdown]);

  const { videoRef, canvasRef, start, status, error } = usePoseCamera(onFrame, "hsl(280 100% 70%)");

  useEffect(() => {
    return () => { audio.stopMusic(); };
  }, []);

  const play = async () => {
    calibrated.current = false;
    await start();

    // Countdown sequence
    setPhaseBoth("counting");
    for (let i = 3; i > 0; i--) {
      setCountdown(i);
      await new Promise(r => setTimeout(r, 1000));
    }
    calibrated.current = true;

    setScore(0);
    setDistance(0);
    obstacles.current = [];
    coins.current = [];
    currentSpeed.current = INITIAL_SPEED;
    phaseRef.current = "playing";
    setPhase("playing");
    audio.startKidsMusic();
  };

  const setPhaseBoth = (p: typeof phase) => {
    phaseRef.current = p;
    setPhase(p);
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
          <h2 className="kid-title text-3xl font-black text-red-500">خسرت! 💥</h2>
          <div className="mt-3 flex justify-center gap-4">
            <KidHud label="النقاط" value={score.toLocaleString("ar-EG")} />
            <KidHud label="المسافة" value={`${Math.floor(distance)}م`} />
          </div>
          <button onClick={play} className="btn-kid mt-5 w-full">
            حاول مرة ثانية 🔁
          </button>
        </div>
      )}
    </GameStage>
  );
}
