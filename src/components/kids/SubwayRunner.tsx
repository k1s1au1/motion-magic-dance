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

    // 3. Drawing: Pseudo-3D
    const centerX = w / 2;
    const horizonY = h * 0.4;
    const roadW = w * 0.8;

    const getX = (lane: Lane, z: number) => {
      const perspective = 1 / z;
      const xOffset = (lane - 1) * (roadW / 3);
      return centerX + xOffset * perspective;
    };

    const getY = (z: number) => horizonY + (h - horizonY) * (1 / z);

    // Draw Tracks
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    for (let l = 0; l <= 3; l++) {
      const xTop = centerX + (l - 1.5) * 10;
      const xBot = centerX + (l - 1.5) * (roadW / 3) * 2;
      ctx.beginPath();
      ctx.moveTo(xTop, horizonY);
      ctx.lineTo(xBot, h);
      ctx.stroke();
    }

    // Draw Coins
    ctx.fillStyle = "#FFD700";
    coins.current.forEach(c => {
      if (c.z < 0.1) return;
      const x = getX(c.lane, c.z);
      const y = getY(c.z);
      const size = (w * 0.05) / c.z;
      ctx.beginPath();
      ctx.arc(x, y - size, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 10;
      ctx.shadowColor = "gold";
    });

    // Draw Obstacles
    obstacles.current.forEach(o => {
      if (o.z < 0.1) return;
      const x = getX(o.lane, o.z);
      const y = getY(o.z);
      const size = (w * 0.1) / o.z;

      ctx.fillStyle = o.type === "barrier-low" ? "#FF4444" : "#4444FF";
      if (o.type === "barrier-low") {
        ctx.fillRect(x - size, y - size, size * 2, size);
      } else {
        ctx.fillRect(x - size, y - size * 3, size * 2, size);
      }
    });

    // Draw Player Indicator
    const px = centerX + (playerLane.current - 1) * (roadW / 4);
    const py = h * 0.85;
    ctx.font = `${w * 0.15}px system-ui`;
    ctx.textAlign = "center";
    let emoji = "🏃";
    if (playerState.current === "jumping") emoji = "🚀";
    if (playerState.current === "ducking") emoji = "👇";
    ctx.fillText(emoji, px, py);

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
