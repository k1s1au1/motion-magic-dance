import { useCallback, useEffect, useRef, useState } from "react";
import GameStage, { KidHud } from "./GameStage";
import { usePoseCamera, type FrameInfo } from "@/lib/usePoseCamera";
import { audio } from "@/lib/audioUtils";
import DifficultyPicker from "./DifficultyPicker";
import { useDifficulty } from "@/lib/difficulty";
import { createCalibrator } from "@/lib/calibration";

type Lane = 0 | 1 | 2; // Left, Center, Right
type Obstacle = { id: number; lane: Lane; z: number; type: "barrier-low" | "barrier-high" | "train"; passed?: boolean; hinted?: boolean };
type Coin = { id: number; lane: Lane; z: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number };

const INITIAL_SPEED = 0.12;
const MAX_SPEED = 0.45;
const SPAWN_RATE = 0.03;

export default function SubwayRunner({ onBack }: { onBack: () => void }) {
  const { diff, id: diffId, select } = useDifficulty();
  const diffRef = useRef(diff);
  diffRef.current = diff;
  const cal = useRef(createCalibrator({ holdSeconds: 1.8 }));
  const [calib, setCalib] = useState({ progress: 0, steady: false });
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
  const baselineX = useRef(0.5);
  const bodyScale = useRef(0.18);
  const calibrated = useRef(false);
  const lastLane = useRef<Lane>(1);
  const calibSamples = useRef(0);

  const { videoRef, canvasRef, start, status, error, visible } = usePoseCamera((f) => onFrame(f), "hsl(280 100% 70%)");

  const spawnParticles = (x: number, y: number, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
      particles.current.push({
        x, y,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12,
        life: 1,
        color,
        size: Math.random() * 6 + 3,
      });
    }
  };

  const onFrame = useCallback(({ lm, ctx, w, h, dt, now, visible: poseOk }: FrameInfo) => {
    const isPlaying = phaseRef.current === "playing";
    const isCounting = phaseRef.current === "counting";
    const isCalibrating = phaseRef.current === "calibrating";

    const d = diffRef.current;

    // 1. Logic: Body Tracking (معايرة موحّدة حسب مقاس الطفل)
    cal.current.setTolerance(d.tolerance);
    const st = cal.current.update(lm, dt, isCalibrating, poseOk);

    if (poseOk) {
      baselineY.current = st.baseY;
      baselineX.current = st.baseX;
      bodyScale.current = st.scale;
      const lane = st.lane;
      playerLane.current = lane;
      if (isPlaying && lane !== lastLane.current) {
        lastLane.current = lane;
        if (lane === 0) audio.speak("يسار");
        else if (lane === 2) audio.speak("يمين");
        else audio.speak("النص");
      }

      if (st.jumping && playerState.current === "normal") {
        playerState.current = "jumping";
        stateTimer.current = now + 650;
        if (isPlaying) { audio.playJump(); audio.speak("اقفز!"); }
      } else if (st.ducking && playerState.current === "normal") {
        playerState.current = "ducking";
        stateTimer.current = now + 650;
        if (isPlaying) { audio.playDuck(); audio.speak("انخفض!"); }
      }
    }

    if (isCalibrating) {
      setCalib({ progress: st.progress, steady: st.steady });
      if (st.ready) startCountdown();
    }

    if (now > stateTimer.current) playerState.current = "normal";

    if (isPlaying) {
      currentSpeed.current = Math.min(MAX_SPEED * d.speed, (INITIAL_SPEED + (distance / 6000)) * d.speed);
      const speed = currentSpeed.current;

      // Fever Mode logic
      const isFever = (Math.floor(distance / 1200) % 2 === 1);
      feverFactor.current = feverFactor.current * 0.96 + (isFever ? 1 : 0) * 0.04;

      setDistance(d => d + speed * 12);
      obstacles.current.forEach(o => o.z -= speed);
      coins.current.forEach(c => c.z -= speed);

      smoothedLaneX.current = smoothedLaneX.current * 0.82 + playerLane.current * 0.18;

      if (Math.random() < 0.015) {
        const texts = ["محطة الملك", "METRO", "المسار ٢", "خروج ⟶", "الرصيف A", "المركز", "تحويلة", "PLATFORM 3"];
        graffiti.current.push({
          lane: Math.random() > 0.5 ? -0.2 : 2.2,
          z: 18,
          text: texts[Math.floor(Math.random() * texts.length)]!,
          color: `hsl(${Math.random() * 360}, 100%, 70%)`
        });
      }
      graffiti.current.forEach(g => g.z -= speed);
      graffiti.current = graffiti.current.filter(g => g.z > 0.1);

      // Voice coach: warn about what is coming in the player's lane
      obstacles.current.forEach(o => {
        if (o.hinted || o.lane !== playerLane.current) return;
        if (o.z < 4.2 && o.z > 2.4) {
          o.hinted = true;
          if (o.type === "barrier-low") audio.speak("اقفز!");
          else if (o.type === "barrier-high") audio.speak("انخفض!");
          else audio.speak(o.lane === 2 ? "روح يسار!" : "روح يمين!");
        }
      });

      // Collision
      obstacles.current.forEach(o => {
        if (o.z < 0.15 && o.z > -0.1 && o.lane === playerLane.current) {
          const safeJump = o.type === "barrier-low" && playerState.current === "jumping";
          const safeDuck = o.type === "barrier-high" && playerState.current === "ducking";

          if (!safeJump && !safeDuck) {
            audio.playFail();
            audio.stopMusic();
            audio.speak("أوووه! حاول مرة ثانية", { force: true });
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
        const c = coins.current[collectedIdx]!;
        const cx = w/2 + (c.lane - 1) * (w*1.5/3) * (1/c.z);
        const cy = h*0.35 + (h - h*0.35) * (1/c.z);
        spawnParticles(cx, cy, "#fff5a0", 20);
        coins.current.splice(collectedIdx, 1);
        setScore(s => s + 250);
        audio.playCoin();
      }

      obstacles.current = obstacles.current.filter(o => o.z > -0.2);
      coins.current = coins.current.filter(c => c.z > -0.2);

      if (Math.random() < SPAWN_RATE / d.spawn) {
        const lane = Math.floor(Math.random() * 3) as Lane;
        const type = Math.random() > 0.8 ? "train" : (Math.random() > 0.4 ? "barrier-high" : "barrier-low");
        obstacles.current.push({ id: nextId.current++, lane, z: 15, type });
      }
      if (Math.random() < (SPAWN_RATE * 1.8) / d.spawn) {
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

    // Subtle, realistic camera motion (no wild rotation)
    if (isPlaying) {
      const camZoom = 1 + (currentSpeed.current - INITIAL_SPEED) * 0.25;
      ctx.translate(centerX, horizonY);
      ctx.scale(camZoom, camZoom);
      ctx.rotate((playerLane.current - 1) * 0.012);
      ctx.translate(-centerX, -horizonY);
      const bob = Math.sin(now * 0.012) * 3;
      ctx.translate(Math.sin(now * 0.008) * 2, bob);
    }

    // ---------- TUNNEL BACKGROUND ----------
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, "#12141a");
    bgGrad.addColorStop(0.35, "#1b1e26");
    bgGrad.addColorStop(1, "#0b0c10");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    const distT = isPlaying ? distance / 100 : now / 900;

    // ---------- TUNNEL SHELL (concrete walls + ceiling) ----------
    const zSteps = 20;
    for (let i = zSteps; i > 0; i--) {
      const zN = i * 0.8, zF = (i + 1) * 0.8;
      const pN = 1 / zN, pF = 1 / zF;
      const x0N = centerX - roadW * pN, x1N = centerX + roadW * pN;
      const x0F = centerX - roadW * pF, x1F = centerX + roadW * pF;
      const yN = getY(zN), yF = getY(zF);
      const whN = tunnelH * pN, whF = tunnelH * pF;
      const shade = 10 + (i % 2) * 4;

      // ballast / trackbed floor
      ctx.fillStyle = `hsl(28, 8%, ${shade + 6}%)`;
      ctx.beginPath();
      ctx.moveTo(x0F, yF); ctx.lineTo(x1F, yF); ctx.lineTo(x1N, yN); ctx.lineTo(x0N, yN);
      ctx.fill();

      // side walls: tiled concrete
      ctx.fillStyle = `hsl(210, 6%, ${shade + 12}%)`;
      ctx.beginPath();
      ctx.moveTo(x0F, yF); ctx.lineTo(x0F, yF - whF); ctx.lineTo(x0N, yN - whN); ctx.lineTo(x0N, yN);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x1F, yF); ctx.lineTo(x1F, yF - whF); ctx.lineTo(x1N, yN - whN); ctx.lineTo(x1N, yN);
      ctx.fill();

      // ceiling
      ctx.fillStyle = `hsl(210, 6%, ${shade + 3}%)`;
      ctx.beginPath();
      ctx.moveTo(x0F, yF - whF); ctx.lineTo(x1F, yF - whF); ctx.lineTo(x1N, yN - whN); ctx.lineTo(x0N, yN - whN);
      ctx.fill();

      // structural ribs every few segments
      if (i % 3 === 0) {
        ctx.strokeStyle = `rgba(255,255,255,${0.10 / zN + 0.02})`;
        ctx.lineWidth = Math.max(1, 10 * pN);
        ctx.beginPath();
        ctx.moveTo(x0N, yN); ctx.lineTo(x0N, yN - whN);
        ctx.lineTo(x1N, yN - whN); ctx.lineTo(x1N, yN);
        ctx.stroke();
      }

      // wall service cable line
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = Math.max(1, 6 * pN);
      ctx.beginPath();
      ctx.moveTo(x0F, yF - whF * 0.55); ctx.lineTo(x0N, yN - whN * 0.55); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x1F, yF - whF * 0.55); ctx.lineTo(x1N, yN - whN * 0.55); ctx.stroke();

      // depth fog
      ctx.fillStyle = `rgba(12, 14, 18, ${Math.min(0.85, (i / zSteps) * 0.9)})`;
      ctx.beginPath();
      ctx.moveTo(x0F, yF - whF); ctx.lineTo(x1F, yF - whF); ctx.lineTo(x1N, yN - whN); ctx.lineTo(x0N, yN);
      ctx.lineTo(x0N, yN); ctx.lineTo(x1N, yN); ctx.lineTo(x1F, yF); ctx.lineTo(x0F, yF);
      ctx.fill();
    }

    // ---------- CEILING LAMPS (fluorescent tubes) ----------
    for (let z = 14 - (distT % 1.5); z > 0.6; z -= 1.5) {
      const p = 1 / z;
      const y = getY(z) - tunnelH * p;
      const lw = roadW * 0.5 * p;
      const alpha = Math.min(1, 4 / z);
      ctx.save();
      ctx.globalAlpha = alpha;
      const g = ctx.createRadialGradient(centerX, y, 0, centerX, y, lw * 2.2);
      g.addColorStop(0, "rgba(255, 246, 214, 0.35)");
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(centerX, y, lw * 2.2, lw * 0.9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff8dc";
      ctx.fillRect(centerX - lw / 2, y - 4 * p, lw, Math.max(2, 14 * p));
      ctx.restore();
    }

    // ---------- SLEEPERS + STEEL RAILS ----------
    for (let z = 15 - (distT % 0.4); z > 0.45; z -= 0.4) {
      const p = 1 / z;
      const tw = roadW * 1.9 * p;
      const y = getY(z);
      ctx.fillStyle = `rgba(70, 55, 42, ${Math.min(1, 2.2 / z)})`;
      ctx.fillRect(centerX - tw / 2, y, tw, Math.max(1.5, 16 * p));
    }
    // two rail pairs framing the running track
    ctx.lineCap = "butt";
    [0.42, 1.58].forEach((l) => {
      const grad = ctx.createLinearGradient(0, horizonY, 0, h);
      grad.addColorStop(0, "rgba(160,170,180,0.25)");
      grad.addColorStop(1, "rgba(215,225,235,0.9)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(getX(l, 1000), horizonY); ctx.lineTo(getX(l, 0.02), h); ctx.stroke();
    });

    // player lane light pool on the ground
    if (isPlaying || isCounting) {
      const sx = getX(smoothedLaneX.current, 1);
      const sy = h * 0.94;
      const spotGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, w * 0.5);
      spotGrad.addColorStop(0, "rgba(255, 244, 214, 0.22)");
      spotGrad.addColorStop(1, "transparent");
      ctx.fillStyle = spotGrad;
      ctx.beginPath(); ctx.ellipse(sx, sy, w * 0.6, w * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    }

    // ---------- WALL SIGNS (station posters instead of neon graffiti) ----------
    graffiti.current.forEach(g => {
      const p = 1 / g.z;
      const left = g.lane < 1;
      const x = getX(left ? -0.15 : 2.15, g.z);
      const y = getY(g.z) - tunnelH * 0.55 * p;
      const bw = w * 0.55 * p, bh = w * 0.24 * p;
      ctx.save();
      ctx.globalAlpha = Math.min(1, 5 / g.z);
      ctx.translate(x, y);
      ctx.transform(1, left ? 0.45 : -0.45, 0, 1, 0, 0);
      ctx.fillStyle = "#0f2f5c";
      ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
      ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = Math.max(1, 4 * p);
      ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
      ctx.fillStyle = "#e8eef7";
      ctx.font = `600 ${bh * 0.42}px system-ui`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(g.text, 0, 0);
      ctx.restore();
    });
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";

    // ---------- TOKENS ----------
    coins.current.forEach(c => {
      if (c.z < 0.2 || c.z > 15) return;
      const x = getX(c.lane, c.z);
      const y = getY(c.z);
      const size = (w * 0.12) / c.z;

      ctx.save();
      ctx.translate(x, y - size * 1.6);
      ctx.scale(Math.abs(Math.sin(now * 0.004)) * 0.8 + 0.2, 1);
      const grad = ctx.createLinearGradient(-size, -size, size, size);
      grad.addColorStop(0, "#fde68a"); grad.addColorStop(0.5, "#f59e0b"); grad.addColorStop(1, "#b45309");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#fff3c4"; ctx.lineWidth = Math.max(1, size * 0.14);
      ctx.beginPath(); ctx.arc(0, 0, size * 0.72, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    });

    // ---------- OBSTACLES ----------
    const hazardStripes = (x: number, y: number, bw: number, bh: number) => {
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, bw, bh); ctx.clip();
      ctx.fillStyle = "#facc15"; ctx.fillRect(x, y, bw, bh);
      ctx.fillStyle = "#18181b";
      const step = Math.max(6, bh * 0.55);
      for (let sx = x - bh; sx < x + bw + bh; sx += step * 2) {
        ctx.beginPath();
        ctx.moveTo(sx, y + bh); ctx.lineTo(sx + step, y + bh);
        ctx.lineTo(sx + step + bh, y); ctx.lineTo(sx + bh, y);
        ctx.fill();
      }
      ctx.restore();
    };

    obstacles.current.sort((a, b) => b.z - a.z).forEach(o => {
      if (o.z < 0.2 || o.z > 15) return;
      const x = getX(o.lane, o.z);
      const y = getY(o.z);
      const size = (w * 0.3) / o.z;

      ctx.save();
      if (o.type === "barrier-low") {
        // maintenance barrier: hazard board on two steel legs
        const bw = size * 2, bh = size * 0.7;
        ctx.fillStyle = "#3f3f46";
        ctx.fillRect(x - size * 0.85, y - size * 0.9, size * 0.16, size * 0.9);
        ctx.fillRect(x + size * 0.69, y - size * 0.9, size * 0.16, size * 0.9);
        hazardStripes(x - size, y - size * 1.5, bw, bh);
        ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = Math.max(1, size * 0.08);
        ctx.strokeRect(x - size, y - size * 1.5, bw, bh);
      } else if (o.type === "barrier-high") {
        // overhead gantry / service pipe you must duck under
        const topY = y - size * 4.4;
        const bh = size * 0.8;
        ctx.fillStyle = "#52525b";
        ctx.fillRect(x - size * 1.05, topY, size * 0.18, size * 4.4);
        ctx.fillRect(x + size * 0.87, topY, size * 0.18, size * 4.4);
        hazardStripes(x - size, topY, size * 2, bh);
        ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = Math.max(1, size * 0.08);
        ctx.strokeRect(x - size, topY, size * 2, bh);
      } else {
        // oncoming metro car
        const trainH = size * 5.2;
        const topY = y - trainH;
        // body
        const body = ctx.createLinearGradient(x - size, 0, x + size, 0);
        body.addColorStop(0, "#6b7280");
        body.addColorStop(0.45, "#d4d8dd");
        body.addColorStop(1, "#6b7280");
        ctx.fillStyle = body;
        ctx.beginPath();
        const r = size * 0.35;
        ctx.moveTo(x - size, y);
        ctx.lineTo(x - size, topY + r);
        ctx.quadraticCurveTo(x - size, topY, x - size + r, topY);
        ctx.lineTo(x + size - r, topY);
        ctx.quadraticCurveTo(x + size, topY, x + size, topY + r);
        ctx.lineTo(x + size, y);
        ctx.closePath();
        ctx.fill();
        // livery stripe
        ctx.fillStyle = "#1d4ed8";
        ctx.fillRect(x - size, y - trainH * 0.28, size * 2, trainH * 0.09);
        // destination sign
        ctx.fillStyle = "#0b0f19";
        ctx.fillRect(x - size * 0.55, topY + size * 0.35, size * 1.1, size * 0.5);
        ctx.fillStyle = "#fbbf24";
        ctx.font = `600 ${size * 0.36}px system-ui`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("METRO", x, topY + size * 0.6);
        ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
        // windshield
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(x - size * 0.75, topY + size * 1.15, size * 1.5, size * 1.1);
        ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = Math.max(1, size * 0.06);
        ctx.strokeRect(x - size * 0.75, topY + size * 1.15, size * 1.5, size * 1.1);
        // headlights
        ctx.fillStyle = "#fffbe8";
        [-0.62, 0.62].forEach(k => {
          const hx = x + size * k, hy = y - size * 0.9;
          const gl = ctx.createRadialGradient(hx, hy, 0, hx, hy, size * 2.2);
          gl.addColorStop(0, "rgba(255,250,220,0.55)"); gl.addColorStop(1, "transparent");
          ctx.fillStyle = gl;
          ctx.beginPath(); ctx.arc(hx, hy, size * 2.2, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#fffbe8";
          ctx.beginPath(); ctx.arc(hx, hy, size * 0.26, 0, Math.PI * 2); ctx.fill();
        });
        // skirt / bogie shadow
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(x - size, y - size * 0.35, size * 2, size * 0.35);
      }
      ctx.restore();
    });

    // ---------- PLAYER ----------
    const pxA = getX(smoothedLaneX.current, 1);
    const pyA = h * 0.9;

    if (lm) {
      const avatarScale = w * 0.6;
      const avatarY = pyA - (playerState.current === "jumping" ? h * 0.42 : 0);
      const bodyColor = playerState.current === "jumping" ? "#f59e0b" : playerState.current === "ducking" ? "#38bdf8" : "#e5e7eb";

      const drawSkellie = (yOff: number) => {
        const p_v = (i: number) => ({ x: (0.5 - lm[i]!.x) * avatarScale, y: (lm[i]!.y - baselineY.current) * avatarScale + yOff });
        const conn: [number, number][] = [[11,12], [11,13], [13,15], [12,14], [14,16], [11,23], [12,24], [23,24], [23,25], [24,26], [25,27], [26,28]];
        conn.forEach(([a, b]) => {
          const p1 = p_v(a), p2 = p_v(b);
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        });
        const head = p_v(0);
        ctx.beginPath(); ctx.arc(head.x, head.y, avatarScale * 0.16, 0, Math.PI * 2); ctx.stroke();
      };

      // ground shadow
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.ellipse(pxA, pyA + h * 0.02, avatarScale * 0.22, avatarScale * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(pxA, avatarY);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 30; drawSkellie(0);
      ctx.strokeStyle = bodyColor; ctx.lineWidth = 20; drawSkellie(0);
      ctx.restore();
    }

    // Particles
    particles.current.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;

    // Score pulse
    if (flash.current && now - flash.current.t < 800) {
      ctx.save();
      const k = (now - flash.current.t) / 800;
      ctx.globalAlpha = 1 - k;
      ctx.translate(w / 2, h * 0.45);
      ctx.scale(1 + k * 0.8, 1 + k * 0.8);
      ctx.fillStyle = flash.current.color;
      ctx.font = `bold ${w * 0.14}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(flash.current.text, 0, 0);
      ctx.restore();
      ctx.textAlign = "left";
    }

    // Motion blur streaks at high speed
    if (isPlaying && currentSpeed.current > INITIAL_SPEED * 1.6) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.10)"; ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const sx = Math.random() * w, sy = horizonY + Math.random() * (h - horizonY);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + (sx - centerX) * 0.25, sy + (sy - horizonY) * 0.25); ctx.stroke();
      }
    }

    // Vignette
    const vig = ctx.createRadialGradient(centerX, h * 0.55, w * 0.3, centerX, h * 0.55, w * 0.95);
    vig.addColorStop(0, "transparent"); vig.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);

    // Countdown
    if (isCounting) {
      ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#fff"; ctx.font = `bold ${w * 0.5}px system-ui`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(countdown.toString(), w / 2, h / 2);
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    }

    ctx.restore();
  }, [countdown, distance]);



  useEffect(() => {
    return () => { audio.stopMusic(); audio.stopSpeech(); };
  }, []);

  const play = async () => {
    calibrated.current = false;
    calibrationTimer.current = 0;
    calibSamples.current = 0;
    lastLane.current = 1;
    cal.current.reset();
    setCalib({ progress: 0, steady: false });
    await start();
    setPhaseBoth("calibrating");
    audio.speak("قف في نص الشاشة وخلّي جسمك كامل يبان", { force: true });
  };

  const startCountdown = async () => {
    if (phaseRef.current === "counting") return;
    setPhaseBoth("counting");
    audio.speak("استعد!", { force: true });
    for (let i = 3; i > 0; i--) {
      setCountdown(i);
      audio.speak(String(i), { cooldown: 0, force: true });
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
    audio.startKidsMusic(diffRef.current.bpm);
    audio.speak("انطلق!", { force: true });
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
      calibProgress={calib.progress}
      isSteady={calib.steady}
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
          <DifficultyPicker value={diffId} onChange={select} />
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
          <DifficultyPicker value={diffId} onChange={select} />
          <button onClick={play} className="btn-kid mt-5 w-full">
            حاول مرة ثانية 🔁
          </button>
        </div>
      )}
    </GameStage>
  );
}
