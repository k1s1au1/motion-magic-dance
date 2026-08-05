import { useCallback, useEffect, useRef, useState } from "react";
import GameStage, { KidHud } from "./GameStage";
import { usePoseCamera, type FrameInfo } from "@/lib/usePoseCamera";
import { audio } from "@/lib/audioUtils";
import { POSE_CONNECTIONS } from "@/lib/dance";

type Lane = 0 | 1 | 2; // Left, Center, Right
type Obstacle = { id: number; lane: Lane; z: number; type: "barrier-low" | "barrier-high" | "train"; passed?: boolean };
type Coin = { id: number; lane: Lane; z: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number };

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
  const particles = useRef<Particle[]>([]);
  const nextId = useRef(0);
  const playerLane = useRef<Lane>(1);
  const playerState = useRef<"normal" | "jumping" | "ducking">("normal");
  const stateTimer = useRef(0);
  const currentSpeed = useRef(INITIAL_SPEED);
  const flash = useRef<{ text: string; t: number; color: string } | null>(null);
  const graffiti = useRef<{lane: number, z: number, text: string, color: string}[]>([]);
  const smoothedLaneX = useRef(1);
  const trail = useRef<{x: number, y: number, a: number}[]>([]);
  const feverFactor = useRef(0);

  // Calibration
  const baselineY = useRef(0.5);
  const calibrated = useRef(false);

  const spawnParticles = (x: number, y: number, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
      particles.current.push({
        x, y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1,
        color,
        size: Math.random() * 5 + 2
      });
    }
  };

  const onFrame = useCallback(({ lm, ctx, w, h, dt, now }: FrameInfo) => {
    const isPlaying = phaseRef.current === "playing";
    const isCounting = phaseRef.current === "counting";

    // 1. Logic: Body Tracking
    if (lm) {
      const nose = lm[0];
      if (nose) {
        const nx = 1 - nose.x;
        if (nx < 0.35) playerLane.current = 0;
        else if (nx > 0.65) playerLane.current = 2;
        else playerLane.current = 1;

        if (!calibrated.current) {
          baselineY.current = baselineY.current * 0.9 + nose.y * 0.1;
        }

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
      currentSpeed.current = Math.min(MAX_SPEED, INITIAL_SPEED + (distance / 5000));
      const speed = currentSpeed.current;

      // Fever Mode logic
      const isFever = (Math.floor(distance / 1000) % 2 === 1);
      feverFactor.current = feverFactor.current * 0.95 + (isFever ? 1 : 0) * 0.05;

      setDistance(d => d + speed * 10);
      obstacles.current.forEach(o => o.z -= speed);
      coins.current.forEach(c => c.z -= speed);

      // Update Smoothing
      smoothedLaneX.current = smoothedLaneX.current * 0.85 + playerLane.current * 0.15;
      if (Math.random() < 0.01) {
        const texts = ["DANCE", "SWIFT", "METRO", "JET", "WOW", "LOVABLE"];
        const colors = ["#ff00ff", "#00ffff", "#ffff00", "#ff0000"];
        graffiti.current.push({
          lane: Math.random() > 0.5 ? 0 : 2,
          z: 15,
          text: texts[Math.floor(Math.random() * texts.length)],
          color: colors[Math.floor(Math.random() * colors.length)]
        });
      }
      graffiti.current.forEach(g => g.z -= speed);
      graffiti.current = graffiti.current.filter(g => g.z > 0.1);

      // Collision
      obstacles.current.forEach(o => {
        if (o.z < 0.1 && o.z > -0.1 && o.lane === playerLane.current) {
          const safeJump = o.type === "barrier-low" && playerState.current === "jumping";
          const safeDuck = o.type === "barrier-high" && playerState.current === "ducking";

          if (!safeJump && !safeDuck) {
            audio.playFail();
            audio.stopMusic();
            phaseRef.current = "finished";
            setPhase("finished");
            spawnParticles(w/2, h/2, "#ff0000", 30);
          }
        }
        if (o.z < -0.1 && !o.passed) {
          o.passed = true;
          setScore(s => s + 50);
          if (o.lane === playerLane.current) {
            flash.current = { text: "رائع! ⚡", t: now, color: "#4ade80" };
          }
        }
      });

      // Collect coins
      const collectedIdx = coins.current.findIndex(c => c.z < 0.2 && c.z > -0.1 && c.lane === playerLane.current);
      if (collectedIdx !== -1) {
        const c = coins.current[collectedIdx];
        const cx = w/2 + (c.lane - 1) * (w*0.8/3) * (1/c.z);
        const cy = h*0.35 + (h - h*0.35) * (1/c.z);
        spawnParticles(cx, cy, "#fbbf24", 10);
        coins.current.splice(collectedIdx, 1);
        setScore(s => s + 200);
        audio.playCoin();
      }

      obstacles.current = obstacles.current.filter(o => o.z > -0.2);
      coins.current = coins.current.filter(c => c.z > -0.2);

      if (Math.random() < SPAWN_RATE) {
        const lane = Math.floor(Math.random() * 3) as Lane;
        const type = Math.random() > 0.7 ? "barrier-high" : (Math.random() > 0.4 ? "train" : "barrier-low");
        obstacles.current.push({ id: nextId.current++, lane, z: 12, type });
      }
      if (Math.random() < SPAWN_RATE * 2) {
        coins.current.push({ id: nextId.current++, lane: Math.floor(Math.random() * 3) as Lane, z: 12 });
      }

      // Update Particles
      particles.current.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
      });
      particles.current = particles.current.filter(p => p.life > 0);
    }

    // 3. Drawing: Advanced Pseudo-3D Tunnel
    const centerX = w / 2;
    const horizonY = h * 0.35;
    const roadW = w * 1.2;
    const tunnelH = h * 0.8;

    const getX = (lane: Lane | number, z: number) => {
      const p = 1 / z;
      const xOffset = (lane - 1) * (roadW / 3);
      return centerX + xOffset * p;
    };
    const getY = (z: number) => horizonY + (h - horizonY) * (1 / z);

    ctx.save();
    if (isPlaying) {
      const shake = Math.sin(now * 0.05) * (playerState.current !== "normal" ? 6 : 2.5);
      ctx.translate(shake, shake);
    }

    // DRAW BACKGROUND
    const bgHue = 240 + feverFactor.current * 60;
    ctx.fillStyle = `hsl(${bgHue}, 50%, 5%)`;
    ctx.fillRect(0, 0, w, h);

    // Tunnel Geometry (Floor & Walls)
    const tunnelZSteps = 10;
    for (let i = tunnelZSteps; i > 0; i--) {
      const zNear = i * 1.5;
      const zFar = (i + 1) * 1.5;
      const pNear = 1 / zNear;
      const pFar = 1 / zFar;

      const x0Near = centerX - roadW * pNear, x1Near = centerX + roadW * pNear;
      const x0Far = centerX - roadW * pFar, x1Far = centerX + roadW * pFar;
      const yNear = getY(zNear), yFar = getY(zFar);

      // Floor pattern (Concrete slabs)
      const floorHue = 240 + feverFactor.current * 100;
      ctx.fillStyle = i % 2 === 0 ? `hsl(${floorHue}, 30%, 10%)` : `hsl(${floorHue}, 30%, 15%)`;
      ctx.beginPath();
      ctx.moveTo(x0Far, yFar); ctx.lineTo(x1Far, yFar); ctx.lineTo(x1Near, yNear); ctx.lineTo(x0Near, yNear);
      ctx.fill();

      // Reflections on floor
      if (i === 1) { // Near floor reflection area
        ctx.save();
        ctx.globalAlpha = 0.15;
        // Reflection of player (simple silhouette)
        const rx = getX(smoothedLaneX.current, 1);
        const ry = h * 0.88;
        ctx.translate(rx, ry + h * 0.05);
        ctx.scale(1, -0.4);
        // We'll draw the reflection later near the player draw
        ctx.restore();
      }

      // Walls
      const wallHue = 240 + feverFactor.current * 120;
      ctx.fillStyle = i % 2 === 0 ? `hsl(${wallHue}, 40%, 5%)` : `hsl(${wallHue}, 40%, 10%)`;
      const whNear = tunnelH * pNear, whFar = tunnelH * pFar;
      // Left
      ctx.beginPath();
      ctx.moveTo(x0Far, yFar); ctx.lineTo(x0Far, yFar - whFar); ctx.lineTo(x0Near, yNear - whNear); ctx.lineTo(x0Near, yNear);
      ctx.fill();
      // Right
      ctx.beginPath();
      ctx.moveTo(x1Far, yFar); ctx.lineTo(x1Far, yFar - whFar); ctx.lineTo(x1Near, yNear - whNear); ctx.lineTo(x1Near, yNear);
      ctx.fill();

      // Neon strips on walls
      ctx.strokeStyle = `hsl(${wallHue}, 100%, 50%, ${0.3 + feverFactor.current * 0.4})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x0Far, yFar - whFar); ctx.lineTo(x0Near, yNear - whNear); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x1Far, yFar - whFar); ctx.lineTo(x1Near, yNear - whNear); ctx.stroke();
    }

    // Graffiti
    graffiti.current.forEach(g => {
      const p = 1 / g.z;
      const x = getX(g.lane === 0 ? -0.2 : 2.2, g.z);
      const y = getY(g.z) - tunnelH * 0.4 * p;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(g.lane === 0 ? Math.PI/2.5 : -Math.PI/2.5);
      ctx.font = `bold ${w * 0.4 * p}px system-ui`;
      ctx.fillStyle = g.color;
      ctx.globalAlpha = Math.min(1, 2/g.z);
      ctx.fillText(g.text, 0, 0);
      ctx.restore();
    });

    // Floor Spotlight
    if (isPlaying || isCounting) {
      const sx = getX(playerLane.current, 1);
      const sy = h * 0.92;
      const spotGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, w * 0.3);
      spotGrad.addColorStop(0, "rgba(255, 255, 255, 0.25)");
      spotGrad.addColorStop(1, "transparent");
      ctx.fillStyle = spotGrad;
      ctx.beginPath(); ctx.ellipse(sx, sy, w * 0.4, w * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    }

    // Tracks & Ties
    const dist = isPlaying ? distance / 100 : now / 500;
    for (let z = 12 - (dist % 0.5); z > 0.5; z -= 0.5) {
      const p = 1 / z;
      const tw = roadW * 1.5 * p;
      ctx.fillStyle = "rgba(40, 40, 60, 0.8)";
      ctx.fillRect(centerX - tw / 2, getY(z), tw, 5 * p);
    }
    ctx.strokeStyle = "rgba(100, 100, 150, 0.4)";
    ctx.lineWidth = 4;
    [0.5, 1.5].forEach(l => {
      ctx.beginPath(); ctx.moveTo(centerX, horizonY); ctx.lineTo(getX(l, 0.1), h); ctx.stroke();
    });

    // Coins (Metallic with Glow)
    coins.current.forEach(c => {
      if (c.z < 0.2 || c.z > 12) return;
      const x = getX(c.lane, c.z);
      const y = getY(c.z);
      const size = (w * 0.1) / c.z;
      const spin = Math.sin(now * 0.015);
      ctx.save();
      ctx.translate(x, y - size);
      ctx.scale(Math.abs(spin), 1);
      ctx.shadowBlur = 15; ctx.shadowColor = "gold";
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
      grad.addColorStop(0, "#fff5a0"); grad.addColorStop(0.5, "#fbbf24"); grad.addColorStop(1, "#d97706");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    // Obstacles (Detailed)
    obstacles.current.sort((a,b) => b.z - a.z).forEach(o => {
      if (o.z < 0.2 || o.z > 12) return;
      const x = getX(o.lane, o.z);
      const y = getY(o.z);
      const size = (w * 0.22) / o.z;

      ctx.save();
      ctx.lineWidth = 3; ctx.strokeStyle = "#fff";

      if (o.type === "barrier-low") {
        ctx.fillStyle = "#ff0033";
        ctx.fillRect(x - size, y - size, size * 2, size);
        ctx.strokeRect(x - size, y - size, size * 2, size);
      } else if (o.type === "barrier-high") {
        const h_bar = size * 3.5;
        ctx.fillStyle = "#0066ff";
        ctx.fillRect(x - size, y - h_bar, size * 2, size * 0.8);
        ctx.strokeRect(x - size, y - h_bar, size * 2, size * 0.8);
        ctx.fillRect(x - size * 0.1, y - h_bar, size * 0.2, h_bar);
      } else {
        // Train
        const trainH = size * 4;

        // Train Reflection
        if (o.z < 4) {
          ctx.save();
          ctx.globalAlpha = 0.1 * (1 - o.z/4);
          ctx.translate(x, y + 5);
          ctx.scale(1, -0.3);
          ctx.fillStyle = "#3d5a73";
          ctx.fillRect(-size, 0, size * 2, trainH);
          ctx.restore();
        }

        const grad = ctx.createLinearGradient(x - size, 0, x + size, 0);
        grad.addColorStop(0, "#2a3d4f"); grad.addColorStop(0.5, "#3d5a73"); grad.addColorStop(1, "#2a3d4f");
        ctx.fillStyle = grad;
        ctx.fillRect(x - size, y - trainH, size * 2, trainH);
        ctx.strokeRect(x - size, y - trainH, size * 2, trainH);
        // Lights
        ctx.shadowBlur = 20; ctx.shadowColor = "yellow";
        ctx.fillStyle = "#ffffaa";
        ctx.beginPath(); ctx.arc(x - size * 0.6, y - size * 0.6, size * 0.3, 0, Math.PI * 2);
        ctx.arc(x + size * 0.6, y - size * 0.6, size * 0.3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    });

    // 4. PLAYER AVATAR
    const px = getX(smoothedLaneX.current, 1);
    const py = h * 0.88;

    if (lm) {
      const avatarScale = w * 0.4;
      const avatarY = py - (playerState.current === "jumping" ? h * 0.3 : 0);
      const neonColor = feverFactor.current > 0.5 ? `hsl(${now * 0.2 % 360}, 100%, 70%)` : (playerState.current === "jumping" ? "#fbbf24" : playerState.current === "ducking" ? "#38bdf8" : "#ffffff");

      // Motion Trail
      if (isPlaying && currentSpeed.current > 0.2) {
        trail.current.push({ x: px, y: avatarY, a: 0.6 });
        if (trail.current.length > 10) trail.current.shift();
      } else {
        trail.current = [];
      }

      trail.current.forEach((t, i) => {
        t.a *= 0.9;
        ctx.save();
        ctx.globalAlpha = t.a * (i / trail.current.length);
        ctx.strokeStyle = neonColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(t.x, t.y - avatarScale * 0.4, avatarScale * 0.3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });

      // Player Reflection
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.translate(px, py + h * 0.02);
      ctx.scale(1, -0.4);
      ctx.strokeStyle = neonColor;
      ctx.lineWidth = 8;
      const drawSkellie = (yOff: number) => {
        const p_v = (i: number) => ({ x: (0.5 - lm[i].x) * avatarScale, y: (lm[i].y - baselineY.current) * avatarScale + yOff });
        const conn: [number, number][] = [[11,12], [11,13], [13,15], [12,14], [14,16], [11,23], [12,24], [23,24], [23,25], [24,26]];
        conn.forEach(([a, b]) => {
          const p1 = p_v(a), p2 = p_v(b);
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        });
        const head = p_v(0);
        ctx.beginPath(); ctx.arc(head.x, head.y, avatarScale * 0.18, 0, Math.PI * 2); ctx.stroke();
      };
      drawSkellie(0);
      ctx.restore();

      // Actual Player
      ctx.save();
      ctx.translate(px, avatarY);
      ctx.strokeStyle = neonColor;
      ctx.shadowColor = neonColor; ctx.shadowBlur = 30;
      ctx.lineWidth = 12; ctx.lineCap = "round";
      drawSkellie(0);
      ctx.restore();

      // Status Icon
      if (playerState.current !== "normal") {
        ctx.font = `bold ${w * 0.15}px system-ui`;
        ctx.fillStyle = neonColor;
        ctx.fillText(playerState.current === "jumping" ? "⬆️" : "⬇️", px + w * 0.25, avatarY - h * 0.15);
      }
    }

      // Running Dust Particles
      if (isPlaying && playerState.current === "normal") {
        spawnParticles(px, h * 0.9, "rgba(255,255,255,0.2)", 1);
      }
    }

    // Particles Drawing
    particles.current.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Feedback Flash
    if (flash.current && now - flash.current.t < 800) {
      ctx.save();
      ctx.globalAlpha = 1 - (now - flash.current.t) / 800;
      ctx.fillStyle = flash.current.color;
      ctx.font = `bold ${w * 0.12}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(flash.current.text, w / 2, h * 0.45);
      ctx.restore();
    }

    // Motion Trails
    if (isPlaying) {
      ctx.strokeStyle = "rgba(255,255,255,0.1)"; ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const sx = Math.random() * w, sy = Math.random() * h;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + (sx - centerX) * 0.2, sy + (sy - horizonY) * 0.2); ctx.stroke();
      }
    }

    // Countdown
    if (isCounting) {
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#fff"; ctx.font = `bold ${w * 0.5}px system-ui`;
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
