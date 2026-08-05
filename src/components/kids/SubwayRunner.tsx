import { useCallback, useEffect, useRef, useState } from "react";
import GameStage, { KidHud } from "./GameStage";
import { usePoseCamera, type FrameInfo } from "@/lib/usePoseCamera";
import { audio } from "@/lib/audioUtils";

type Lane = 0 | 1 | 2; // Left, Center, Right
type Obstacle = { id: number; lane: Lane; z: number; type: "barrier-low" | "barrier-high" | "train"; passed?: boolean };
type Coin = { id: number; lane: Lane; z: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number };

const INITIAL_SPEED = 0.12;
const MAX_SPEED = 0.45;
const SPAWN_RATE = 0.03;

export default function SubwayRunner({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<"idle" | "calibrating" | "counting" | "playing" | "finished">("idle");
  const [score, setScore] = useState(0);
  const [distance, setDistance] = useState(0);
  const [countdown, setCountdown] = useState(3);

  const phaseRef = useRef<"idle" | "calibrating" | "counting" | "playing" | "finished">("idle");
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
  const calibrationTimer = useRef(0);

  // Calibration
  const baselineY = useRef(0.5);
  const calibrated = useRef(false);

  const { videoRef, canvasRef, start, status, error, visible } = usePoseCamera((f) => onFrame(f), "hsl(280 100% 70%)");

  const onFrame = useCallback(({ lm, ctx, w, h, dt, now }: FrameInfo) => {
    const isPlaying = phaseRef.current === "playing";
    const isCounting = phaseRef.current === "counting";
    const isCalibrating = phaseRef.current === "calibrating";

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
          stateTimer.current = now + 650;
          if (isPlaying) audio.playJump();
        } else if (dy > 0.12 && playerState.current === "normal") {
          playerState.current = "ducking";
          stateTimer.current = now + 650;
          if (isPlaying) audio.playDuck();
        }
      }
    }

    // Calibration Logic in Loop
    if (isCalibrating) {
      if (visible) {
        calibrationTimer.current += dt;
        if (calibrationTimer.current > 2.0) {
          startCountdown();
        }
      } else {
        calibrationTimer.current = 0;
      }
    }

    if (now > stateTimer.current) playerState.current = "normal";

    if (isPlaying) {
      currentSpeed.current = Math.min(MAX_SPEED, INITIAL_SPEED + (distance / 6000));
      const speed = currentSpeed.current;

      // Fever Mode logic
      const isFever = (Math.floor(distance / 1200) % 2 === 1);
      feverFactor.current = feverFactor.current * 0.96 + (isFever ? 1 : 0) * 0.04;

      setDistance(d => d + speed * 12);
      obstacles.current.forEach(o => o.z -= speed);
      coins.current.forEach(c => c.z -= speed);

      smoothedLaneX.current = smoothedLaneX.current * 0.82 + playerLane.current * 0.18;

      if (Math.random() < 0.015) {
        const texts = ["DANCE", "SWIFT", "METRO", "JET", "WOW", "LOVABLE", "EXTREME", "ULTRA"];
        graffiti.current.push({
          lane: Math.random() > 0.5 ? -0.2 : 2.2,
          z: 18,
          text: texts[Math.floor(Math.random() * texts.length)],
          color: `hsl(${Math.random() * 360}, 100%, 70%)`
        });
      }
      graffiti.current.forEach(g => g.z -= speed);
      graffiti.current = graffiti.current.filter(g => g.z > 0.1);

      // Collision
      obstacles.current.forEach(o => {
        if (o.z < 0.15 && o.z > -0.1 && o.lane === playerLane.current) {
          const safeJump = o.type === "barrier-low" && playerState.current === "jumping";
          const safeDuck = o.type === "barrier-high" && playerState.current === "ducking";

          if (!safeJump && !safeDuck) {
            audio.playFail();
            audio.stopMusic();
            phaseRef.current = "finished";
            setPhase("finished");
            spawnParticles(w/2, h/2, "#ff0000", 50);
          }
        }
        if (o.z < -0.1 && !o.passed) {
          o.passed = true;
          setScore(s => s + 50);
          if (o.lane === playerLane.current) {
            flash.current = { text: "فخامة! ✨", t: now, color: "#fbbf24" };
          }
        }
      });

      // Collect coins
      const collectedIdx = coins.current.findIndex(c => c.z < 0.3 && c.z > -0.1 && c.lane === playerLane.current);
      if (collectedIdx !== -1) {
        const c = coins.current[collectedIdx];
        const cx = w/2 + (c.lane - 1) * (w*1.5/3) * (1/c.z);
        const cy = h*0.35 + (h - h*0.35) * (1/c.z);
        spawnParticles(cx, cy, "#fff5a0", 20);
        coins.current.splice(collectedIdx, 1);
        setScore(s => s + 250);
        audio.playCoin();
      }

      obstacles.current = obstacles.current.filter(o => o.z > -0.2);
      coins.current = coins.current.filter(c => c.z > -0.2);

      if (Math.random() < SPAWN_RATE) {
        const lane = Math.floor(Math.random() * 3) as Lane;
        const type = Math.random() > 0.8 ? "train" : (Math.random() > 0.4 ? "barrier-high" : "barrier-low");
        obstacles.current.push({ id: nextId.current++, lane, z: 15, type });
      }
      if (Math.random() < SPAWN_RATE * 1.8) {
        coins.current.push({ id: nextId.current++, lane: Math.floor(Math.random() * 3) as Lane, z: 15 });
      }

      particles.current.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        p.life -= 0.025;
      });
      particles.current = particles.current.filter(p => p.life > 0);
    }
    // ... drawing logic remains same, can be inside onFrame or moved to separate function ...

    // 3. Drawing: EXTREME VISUALS
    const centerX = w / 2;
    const horizonY = h * 0.35;
    const roadW = w * 1.8;
    const tunnelH = h * 1.1;

    const getX = (lane: Lane | number, z: number) => {
      const p = 1 / z;
      const xOffset = (lane - 1) * (roadW / 3);
      return centerX + xOffset * p;
    };
    const getY = (z: number) => horizonY + (h - horizonY) * (1 / z);

    ctx.save();

    // CINEMATIC DYNAMIC CAMERA
    if (isPlaying) {
      const camZoom = 1 + (currentSpeed.current - INITIAL_SPEED) * 0.8 + (playerState.current === "jumping" ? -0.08 : 0);
      ctx.translate(centerX, horizonY);
      ctx.scale(camZoom, camZoom);
      const targetTilt = (playerLane.current - 1) * 0.05;
      ctx.rotate(targetTilt);
      ctx.translate(-centerX, -horizonY);

      const shake = Math.sin(now * 0.06) * (playerState.current !== "normal" ? 10 : 4);
      ctx.translate(shake, shake);
    }

    // ATMOSPHERIC BACKGROUND
    const themeHue = 240 + feverFactor.current * 100 + Math.sin(now * 0.001) * 40;
    const bgGrad = ctx.createRadialGradient(centerX, horizonY, 0, centerX, horizonY, w);
    bgGrad.addColorStop(0, `hsl(${themeHue}, 80%, 12%)`);
    bgGrad.addColorStop(1, `hsl(${themeHue}, 60%, 2%)`);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // EXTREME TUNNEL GEOMETRY
    const tunnelZSteps = 18;
    for (let i = tunnelZSteps; i > 0; i--) {
      const zNear = i * 1.2;
      const zFar = (i + 1) * 1.2;
      const pNear = 1 / zNear;
      const pFar = 1 / zFar;

      const x0Near = centerX - roadW * pNear, x1Near = centerX + roadW * pNear;
      const x0Far = centerX - roadW * pFar, x1Far = centerX + roadW * pFar;
      const yNear = getY(zNear), yFar = getY(zFar);

      // Atmospheric Fog
      const fogAlpha = Math.min(1, i / tunnelZSteps);
      const fogColor = `hsla(${themeHue}, 60%, 4%, ${fogAlpha})`;

      // Floor (Polished Concrete with Bloom)
      ctx.fillStyle = i % 2 === 0 ? `hsl(${themeHue}, 50%, 10%)` : `hsl(${themeHue}, 50%, 15%)`;
      ctx.beginPath();
      ctx.moveTo(x0Far, yFar); ctx.lineTo(x1Far, yFar); ctx.lineTo(x1Near, yNear); ctx.lineTo(x0Near, yNear);
      ctx.fill();

      if (i % 3 === 0) {
        ctx.fillStyle = `hsla(${themeHue}, 100%, 80%, ${0.2 / zNear})`;
        ctx.fillRect(x0Near, yNear, x1Near - x0Near, 3);
      }

      // Walls with Geometric Support
      const whNear = tunnelH * pNear, whFar = tunnelH * pFar;
      ctx.fillStyle = i % 2 === 0 ? `hsl(${themeHue}, 60%, 6%)` : `hsl(${themeHue}, 60%, 10%)`;
      // Left
      ctx.beginPath();
      ctx.moveTo(x0Far, yFar); ctx.lineTo(x0Far, yFar - whFar); ctx.lineTo(x0Near, yNear - whNear); ctx.lineTo(x0Near, yNear);
      ctx.fill();
      // Right
      ctx.beginPath();
      ctx.moveTo(x1Far, yFar); ctx.lineTo(x1Far, yFar - whFar); ctx.lineTo(x1Near, yNear - whNear); ctx.lineTo(x1Near, yNear);
      ctx.fill();

      // Cyber Beams
      if (i % 4 === 0) {
        ctx.strokeStyle = `hsl(${themeHue}, 100%, 70%, ${0.5/zNear})`;
        ctx.lineWidth = 4;
        ctx.strokeRect(x0Near, yNear - whNear, 5, whNear);
        ctx.strokeRect(x1Near - 5, yNear - whNear, 5, whNear);
      }

      // Fog layer
      ctx.fillStyle = fogColor;
      ctx.beginPath();
      ctx.moveTo(x0Far, yFar); ctx.lineTo(x1Far, yFar); ctx.lineTo(x1Near, yNear); ctx.lineTo(x0Near, yNear);
      ctx.fill();
    }

    // Graffiti with High Glow
    graffiti.current.forEach(g => {
      const p = 1 / g.z;
      const x = getX(g.lane === -0.2 ? -0.1 : 2.1, g.z);
      const y = getY(g.z) - tunnelH * 0.55 * p;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(g.lane < 1 ? Math.PI/3 : -Math.PI/3);
      ctx.font = `bold ${w * 0.7 * p}px system-ui`;
      ctx.fillStyle = g.color;
      ctx.shadowBlur = 40 * p; ctx.shadowColor = g.color;
      ctx.globalAlpha = Math.min(1, 6/g.z);
      ctx.fillText(g.text, 0, 0);
      ctx.restore();
    });

    // Advanced Lane Spotlight
    if (isPlaying || isCounting) {
      const sx = getX(smoothedLaneX.current, 1);
      const sy = h * 0.94;
      const spotGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, w * 0.6);
      spotGrad.addColorStop(0, "rgba(255, 255, 255, 0.5)");
      spotGrad.addColorStop(0.3, `hsla(${themeHue}, 100%, 80%, 0.3)`);
      spotGrad.addColorStop(1, "transparent");
      ctx.fillStyle = spotGrad;
      ctx.beginPath(); ctx.ellipse(sx, sy, w * 0.8, w * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    }

    // Rails & Ties
    const distT = isPlaying ? distance / 100 : now / 500;
    for (let z = 15 - (distT % 0.5); z > 0.5; z -= 0.5) {
      const p = 1 / z;
      const tw = roadW * 2.5 * p;
      ctx.fillStyle = `rgba(100, 100, 150, ${1.2 / z})`;
      ctx.fillRect(centerX - tw / 2, getY(z), tw, 8 * p);
    }
    ctx.strokeStyle = `hsla(${themeHue}, 100%, 90%, 0.7)`; ctx.lineWidth = 8;
    [0.58, 1.42].forEach(l => {
      ctx.beginPath(); ctx.moveTo(centerX, horizonY); ctx.lineTo(getX(l, 0.02), h); ctx.stroke();
    });

    // Coins (Point Lights & Lens Flare hint)
    coins.current.forEach(c => {
      if (c.z < 0.2 || c.z > 15) return;
      const x = getX(c.lane, c.z);
      const y = getY(c.z);
      const size = (w * 0.15) / c.z;

      ctx.save(); // Floor Point Light
      const lGrad = ctx.createRadialGradient(x, y, 0, x, y, size * 8);
      lGrad.addColorStop(0, "rgba(255, 215, 0, 0.4)"); lGrad.addColorStop(1, "transparent");
      ctx.fillStyle = lGrad; ctx.beginPath(); ctx.ellipse(x, y, size * 6, size * 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(x, y - size);
      ctx.scale(Math.abs(Math.sin(now * 0.025)), 1);
      ctx.shadowBlur = 60; ctx.shadowColor = "gold";
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
      grad.addColorStop(0, "#fff"); grad.addColorStop(0.3, "#fbbf24"); grad.addColorStop(1, "#d97706");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    // Obstacles (Point Light & Reflection)
    obstacles.current.sort((a,b) => b.z - a.z).forEach(o => {
      if (o.z < 0.2 || o.z > 15) return;
      const x = getX(o.lane, o.z);
      const y = getY(o.z);
      const size = (w * 0.32) / o.z;

      ctx.save();
      ctx.lineWidth = 6; ctx.strokeStyle = "#fff";

      if (o.type === "barrier-low") {
        ctx.fillStyle = "#ff0000"; ctx.shadowBlur = 50 / o.z; ctx.shadowColor = "red";
        ctx.fillRect(x - size, y - size, size * 2, size); ctx.strokeRect(x - size, y - size, size * 2, size);
      } else if (o.type === "barrier-high") {
        const h_bar = size * 4.5;
        ctx.fillStyle = "#00ccff"; ctx.shadowBlur = 50 / o.z; ctx.shadowColor = "cyan";
        ctx.fillRect(x - size, y - h_bar, size * 2, size * 1.2); ctx.strokeRect(x - size, y - h_bar, size * 2, size * 1.2);
      } else {
        const trainH = size * 6;
        // Reflection
        ctx.save(); ctx.globalAlpha = 0.3 * (1 - o.z/8); ctx.translate(x, y + 15); ctx.scale(1, -0.45);
        ctx.fillStyle = "#2c445c"; ctx.fillRect(-size, 0, size * 2, trainH * 0.6); ctx.restore();

        // Point Light
        const lGrad = ctx.createRadialGradient(x, y, 0, x, y, size * 12);
        lGrad.addColorStop(0, "rgba(200, 255, 255, 0.25)"); lGrad.addColorStop(1, "transparent");
        ctx.fillStyle = lGrad; ctx.beginPath(); ctx.ellipse(x, y, size * 10, size * 3, 0, 0, Math.PI * 2); ctx.fill();

        const grad = ctx.createLinearGradient(x - size, 0, x + size, 0);
        grad.addColorStop(0, "#0a131f"); grad.addColorStop(0.5, "#2c445c"); grad.addColorStop(1, "#0a131f");
        ctx.fillStyle = grad; ctx.fillRect(x - size, y - trainH, size * 2, trainH);
        ctx.strokeRect(x - size, y - trainH, size * 2, trainH);

        ctx.shadowBlur = 70; ctx.shadowColor = "white"; ctx.fillStyle = "#fff";
        const eyeSize = size * 0.5;
        ctx.beginPath(); ctx.arc(x - size * 0.6, y - size * 1, eyeSize, 0, Math.PI * 2);
        ctx.arc(x + size * 0.6, y - size * 1, eyeSize, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    });

    // 4. EXTREME PLAYER AVATAR
    const pxA = getX(smoothedLaneX.current, 1);
    const pyA = h * 0.9;

    if (lm) {
      const avatarScale = w * 0.65;
      const avatarY = pyA - (playerState.current === "jumping" ? h * 0.45 : 0);
      const neonColor = feverFactor.current > 0.4 ? `hsl(${(now * 0.4) % 360}, 100%, 85%)` : (playerState.current === "jumping" ? "#fbbf24" : playerState.current === "ducking" ? "#00ffff" : "#ffffff");

      // Dynamic Trail
      if (isPlaying) {
        trail.current.push({ x: pxA, y: avatarY, a: 1.0 });
        if (trail.current.length > 20) trail.current.shift();
      }

      trail.current.forEach((t, i) => {
        t.a *= 0.94;
        ctx.save();
        ctx.globalAlpha = t.a * (i / trail.current.length) * 0.5;
        ctx.strokeStyle = neonColor;
        ctx.lineWidth = 2 + (i/trail.current.length) * 25;
        ctx.beginPath(); ctx.arc(t.x, t.y - avatarScale * 0.4, avatarScale * 0.35, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      });

      // Reflection
      ctx.save(); ctx.globalAlpha = 0.4; ctx.translate(pxA, pyA + h * 0.08); ctx.scale(1, -0.6);
      ctx.strokeStyle = neonColor; ctx.lineWidth = 25;
      const drawSkellie = (yOff: number) => {
        const p_v = (i: number) => ({ x: (0.5 - lm[i].x) * avatarScale, y: (lm[i].y - baselineY.current) * avatarScale + yOff });
        const conn: [number, number][] = [[11,12], [11,13], [13,15], [12,14], [14,16], [11,23], [12,24], [23,24], [23,25], [24,26]];
        conn.forEach(([a, b]) => {
          const p1 = p_v(a), p2 = p_v(b);
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        });
        const head = p_v(0); ctx.beginPath(); ctx.arc(head.x, head.y, avatarScale * 0.25, 0, Math.PI * 2); ctx.stroke();
      };
      drawSkellie(0); ctx.restore();

      // Main Avatar
      ctx.save(); ctx.translate(pxA, avatarY); ctx.strokeStyle = neonColor; ctx.shadowColor = neonColor; ctx.shadowBlur = 80;
      ctx.lineWidth = 28; ctx.lineCap = "round"; drawSkellie(0); ctx.restore();

      // Action VFX
      if (playerState.current !== "normal") {
        ctx.save(); ctx.translate(pxA + w * 0.4, avatarY - h * 0.3);
        ctx.scale(2.0 + Math.sin(now * 0.03) * 0.4, 2.0 + Math.sin(now * 0.03) * 0.4);
        ctx.font = `bold ${w * 0.25}px system-ui`;
        ctx.shadowBlur = 30; ctx.shadowColor = "white";
        ctx.fillText(playerState.current === "jumping" ? "🚀" : "🛡️", 0, 0);
        ctx.restore();
      }
    }

    // Particles
    particles.current.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 20; ctx.shadowColor = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 1.5, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;

    // UI Score Pulse
    if (flash.current && now - flash.current.t < 800) {
      ctx.save();
      const k = (now - flash.current.t) / 800;
      ctx.globalAlpha = 1 - k;
      ctx.translate(w/2, h*0.45);
      ctx.scale(1 + k * 1.5, 1 + k * 1.5);
      ctx.fillStyle = flash.current.color;
      ctx.font = `bold ${w * 0.18}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(flash.current.text, 0, 0);
      ctx.restore();
    }

    // SPEED LINES (Post-Process Aberration hint)
    if (isPlaying) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)"; ctx.lineWidth = 3;
      for (let i = 0; i < 20; i++) {
        const sx = Math.random() * w, sy = Math.random() * h;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + (sx - centerX) * 0.4, sy + (sy - horizonY) * 0.4); ctx.stroke();
      }
    }

    // Countdown
    if (isCounting) {
      ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#fff"; ctx.font = `bold ${w * 0.7}px system-ui`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowBlur = 100; ctx.shadowColor = "gold";
      ctx.fillText(countdown.toString(), w / 2, h / 2);
    }

    ctx.restore();
  }, [countdown, distance]); // Added distance to deps for better track update

  const { videoRef, canvasRef, start, status, error } = usePoseCamera(onFrame, "hsl(280 100% 70%)");

  useEffect(() => {
    return () => { audio.stopMusic(); };
  }, []);

  const play = async () => {
    calibrated.current = false;
    calibrationTimer.current = 0;
    await start();

    setPhaseBoth("calibrating");
  };

  const startCountdown = async () => {
    if (phaseRef.current === "counting") return;
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
    particles.current = [];
    trail.current = [];
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
      isCalibrating={phase === "calibrating"}
      isPoseVisible={visible}
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
