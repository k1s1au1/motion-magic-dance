import { useCallback, useEffect, useRef, useState } from "react";
import GameStage, { KidHud } from "./GameStage";
import { usePoseCamera, type FrameInfo } from "@/lib/usePoseCamera";
import { MOVES, type Move } from "@/lib/dance";
import { audio } from "@/lib/audioUtils";

type KidPose = {
  move: Move;
  name: string;
  emoji: string;
  hint: string;
  silhouette?: { [key: number]: { x: number, y: number } }
};
type Leaf = { x: number; y: number; r: number; vx: number; vy: number; rotation: number; dr: number; color: string; z: number };

const KID_POSES: KidPose[] = [
  { id: "both-up", name: "الزرافة", emoji: "🦒", hint: "ارفع يديك فوق راسك مثل رقبة الزرافة",
    silhouette: { 15: {x: 0.4, y: 0.1}, 16: {x: 0.6, y: 0.1}, 13: {x: 0.42, y: 0.3}, 14: {x: 0.58, y: 0.3}, 11: {x: 0.45, y: 0.45}, 12: {x: 0.55, y: 0.45} }
  },
  { id: "t-pose", name: "الطيارة", emoji: "✈️", hint: "افرد ذراعيك مثل جناحين الطيارة",
    silhouette: { 15: {x: 0.1, y: 0.45}, 16: {x: 0.9, y: 0.45}, 13: {x: 0.3, y: 0.45}, 14: {x: 0.7, y: 0.45}, 11: {x: 0.45, y: 0.45}, 12: {x: 0.55, y: 0.45} }
  },
  { id: "clap", name: "السمكة", emoji: "🐟", hint: "اجمع يديك قدام صدرك مثل السمكة",
    silhouette: { 15: {x: 0.48, y: 0.5}, 16: {x: 0.52, y: 0.5}, 13: {x: 0.4, y: 0.6}, 14: {x: 0.6, y: 0.6}, 11: {x: 0.45, y: 0.45}, 12: {x: 0.55, y: 0.45} }
  },
  { id: "squat", name: "الضفدع", emoji: "🐸", hint: "انزل قرفصاء مثل الضفدع",
    silhouette: { 11: {x: 0.45, y: 0.6}, 12: {x: 0.55, y: 0.6}, 23: {x: 0.45, y: 0.8}, 24: {x: 0.55, y: 0.8}, 25: {x: 0.35, y: 0.9}, 26: {x: 0.65, y: 0.9} }
  },
  { id: "right-up", name: "الفيل", emoji: "🐘", hint: "ارفع يدك اليمنى مثل خرطوم الفيل",
    silhouette: { 16: {x: 0.6, y: 0.1}, 14: {x: 0.58, y: 0.3}, 12: {x: 0.55, y: 0.45}, 15: {x: 0.4, y: 0.6}, 13: {x: 0.42, y: 0.55}, 11: {x: 0.45, y: 0.45} }
  },
  { id: "left-up", name: "الأرنب", emoji: "🐰", hint: "ارفع يدك اليسرى مثل أذن الأرنب",
    silhouette: { 15: {x: 0.4, y: 0.1}, 13: {x: 0.42, y: 0.3}, 11: {x: 0.45, y: 0.45}, 16: {x: 0.6, y: 0.6}, 14: {x: 0.58, y: 0.55}, 12: {x: 0.55, y: 0.45} }
  },
  { id: "lean-right", name: "الشجرة يمين", emoji: "🌳", hint: "مِل بجسمك لليمين مثل الشجرة مع الهواء",
    silhouette: { 11: {x: 0.55, y: 0.4}, 12: {x: 0.65, y: 0.4}, 23: {x: 0.45, y: 0.8}, 24: {x: 0.55, y: 0.8} }
  },
  { id: "lean-left", name: "الشجرة يسار", emoji: "🌴", hint: "مِل بجسمك لليسار مثل النخلة",
    silhouette: { 11: {x: 0.35, y: 0.4}, 12: {x: 0.45, y: 0.4}, 23: {x: 0.45, y: 0.8}, 24: {x: 0.55, y: 0.8} }
  },
]
  .map((k) => {
    const move = MOVES.find((m) => m.id === k.id);
    return move ? { move, name: k.name, emoji: k.emoji, hint: k.hint, silhouette: k.silhouette } : null;
  })
  .filter(Boolean) as KidPose[];

const HOLD_MS = 1000;
const ROUND_MS = 15000;
const ROUNDS = 6;

export default function AnimalPoses({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<"idle" | "calibrating" | "playing" | "finished">("idle");
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(1);
  const [target, setTarget] = useState<KidPose | null>(null);
  const [match, setMatch] = useState(0);
  const [hold, setHold] = useState(0);
  const [win, setWin] = useState(false);

  const phaseRef = useRef<"idle" | "calibrating" | "playing" | "finished">("idle");
  const orderRef = useRef<KidPose[]>([]);
  const idxRef = useRef(0);
  const holdRef = useRef(0);
  const roundEnd = useRef(0);
  const leaves = useRef<Leaf[]>([]);
  const forestPhase = useRef(0);
  const calibrationTimer = useRef(0);

  const nextRound = (now: number) => {
    idxRef.current += 1;
    holdRef.current = 0; setHold(0); setWin(false);
    if (idxRef.current >= orderRef.current.length) {
      phaseRef.current = "finished"; setPhase("finished"); setTarget(null); return;
    }
    setRound(idxRef.current + 1); setTarget(orderRef.current[idxRef.current] ?? null);
    roundEnd.current = now + ROUND_MS;
  };

  const onFrame = useCallback(({ lm, ctx, w, h, dt, now }: FrameInfo) => {
    const isCalibrating = phaseRef.current === "calibrating";
    const isPlaying = phaseRef.current === "playing";

    // ... nature particles ...
    forestPhase.current += 0.01;
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, "#2d5a27"); bgGrad.addColorStop(1, "#1a3311");
    ctx.fillStyle = bgGrad; ctx.fillRect(0,0,w,h);

    // Volumetric Sunbeams
    ctx.save(); ctx.globalCompositeOperation = "screen";
    for(let i=0; i<3; i++) {
        const lx = w * 0.2 + Math.sin(forestPhase.current * 0.5 + i) * w * 0.3;
        const beamGrad = ctx.createLinearGradient(lx, 0, lx + 200, h);
        beamGrad.addColorStop(0, "rgba(255, 255, 200, 0.2)"); beamGrad.addColorStop(1, "transparent");
        ctx.fillStyle = beamGrad; ctx.beginPath();
        ctx.moveTo(lx, 0); ctx.lineTo(lx+100, 0); ctx.lineTo(lx+300, h); ctx.lineTo(lx+100, h); ctx.fill();
    }
    ctx.restore();

    // Leaf Particles
    if (leaves.current.length < 25) {
      leaves.current.push({
        x: Math.random() * w, y: -50, z: Math.random(),
        r: 8 + Math.random() * 20, vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 3,
        rotation: Math.random() * Math.PI * 2, dr: (Math.random() - 0.5) * 0.15,
        color: `hsl(${30 + Math.random() * 90}, 70%, ${30 + Math.random()*20}%)`
      });
    }
    leaves.current.forEach(l => {
      l.x += l.vx + Math.sin(now * 0.001 + l.z) * 1.5; l.y += l.vy; l.rotation += l.dr;
      if (l.y > h + 50) { l.y = -50; l.x = Math.random()*w; }
      ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.rotation); ctx.globalAlpha = 0.6 + l.z*0.4;
      ctx.fillStyle = l.color; ctx.beginPath(); ctx.ellipse(0, 0, l.r, l.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    // Calibration Logic
    if (isCalibrating) {
      if (visible) {
        calibrationTimer.current += dt;
        if (calibrationTimer.current > 2.0) {
          startPlaying();
        }
      } else {
        calibrationTimer.current = 0;
      }
    }

    if (isPlaying) {
      const pose = orderRef.current[idxRef.current];
      if (!pose) return;
      // ...

    const q = lm ? Math.max(0, Math.min(1, pose.move.match(lm))) : 0;
    setMatch(q);

    if (q > 0.65) {
      holdRef.current += 16.7; setHold(Math.min(1, holdRef.current / HOLD_MS));
      if (holdRef.current >= HOLD_MS) {
        setScore((s) => s + 1000 + Math.round(q * 500));
        setWin(true); audio.playSuccess();
        nextRound(now); return;
      }
    } else {
      holdRef.current = Math.max(0, holdRef.current - 10); setHold(Math.min(1, holdRef.current / HOLD_MS));
    }

    if (now >= roundEnd.current) nextRound(now);

    // 2. EXTREME SILHOUETTE & SKELETON
    if (pose && pose.silhouette) {
      ctx.save(); ctx.globalAlpha = 0.4 + Math.sin(now*0.005)*0.1;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)"; ctx.setLineDash([15, 10]);
      ctx.lineWidth = 14; ctx.lineCap = "round";
      const sil = pose.silhouette;
      const conn: [number, number][] = [[11,12], [11,13], [13,15], [12,14], [14,16], [11,23], [12,24], [23,24]];
      conn.forEach(([a, b]) => {
        if (sil[a] && sil[b]) { ctx.beginPath(); ctx.moveTo(sil[a].x * w, sil[a].y * h); ctx.lineTo(sil[b].x * w, sil[b].y * h); ctx.stroke(); }
      });
      ctx.restore();
    }

    if (lm) {
      ctx.save();
      const isMatching = q > 0.6;
      const glowColor = isMatching ? "#4ade80" : "#ffffff";
      ctx.strokeStyle = glowColor; ctx.shadowColor = glowColor; ctx.shadowBlur = isMatching ? 40 : 10;
      ctx.lineWidth = 16; ctx.lineCap = "round";
      const conn: [number, number][] = [[11,12], [11,13], [13,15], [12,14], [14,16], [11,23], [12,24], [23,24], [23,25], [24,26]];
      conn.forEach(([a, b]) => {
        if (lm[a] && lm[b]) { ctx.beginPath(); ctx.moveTo(lm[a].x * w, lm[a].y * h); ctx.lineTo(lm[b].x * w, lm[b].y * h); ctx.stroke(); }
      });
      ctx.restore();
    }

    // Depth of Field Blur (Simple Vignette)
    const blurGrad = ctx.createRadialGradient(w/2, h/2, w*0.4, w/2, h/2, w*0.8);
    blurGrad.addColorStop(0, "transparent"); blurGrad.addColorStop(1, "rgba(0,0,0,0.3)");
    ctx.fillStyle = blurGrad; ctx.fillRect(0,0,w,h);

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
    const shuffled = [...KID_POSES].sort(() => Math.random() - 0.5).slice(0, ROUNDS);
    orderRef.current = shuffled; idxRef.current = 0; holdRef.current = 0;
    setScore(0); setHold(0); setWin(false); setRound(1); setTarget(shuffled[0] ?? null);
    roundEnd.current = performance.now() + ROUND_MS;
    phaseRef.current = "playing"; setPhase("playing"); audio.startKidsMusic();
  };

  const setPhaseBoth = (p: typeof phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  return (
    <GameStage
      videoRef={videoRef} canvasRef={canvasRef} title="غابة الحيوانات" emoji="🦒" onBack={onBack}
      isCalibrating={phase === "calibrating"}
      isPoseVisible={visible}
      hud={phase === "playing" ? (
        <>
          <KidHud label="النقاط" value={score.toLocaleString("ar-EG")} />
          <KidHud label="الجولة" value={`${round}/${ROUNDS}`} />
        </>
      ) : null}
      banner={phase === "playing" && target ? (
        <div className="relative mt-3 px-5 text-center">
          <div className={`kid-banner bg-white/20 backdrop-blur-md ${win ? "kid-win" : ""}`}>
            <span className="text-4xl">{target.emoji}</span> <span className="text-white drop-shadow-lg">{target.name}</span>
          </div>
          <div className="mt-3 h-4 w-full overflow-hidden rounded-full bg-black/30 border border-white/20">
            <div className="h-full bg-gradient-to-r from-green-400 to-emerald-600 transition-all shadow-[0_0_15px_rgba(74,222,128,0.5)]" style={{ width: `${match * 100}%` }} />
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/20">
            <div className="h-full bg-white transition-all shadow-white shadow-sm" style={{ width: `${hold * 100}%` }} />
          </div>
        </div>
      ) : null}
    >
      {phase === "idle" && (
        <div className="text-center">
          <h2 className="kid-title text-3xl font-black">غابة الحيوانات 🦒🌴</h2>
          <p className="mt-2 text-sm text-muted-foreground">قلّد الحيوان واثبت في مكانك داخل الغابة السحرية!</p>
          <button onClick={play} disabled={status === "loading"} className="btn-kid mt-5 w-full shadow-2xl">
            {status === "loading" ? "استدعاء الحيوانات…" : "دخول الغابة! 🍃"}
          </button>
        </div>
      )}
      {phase === "finished" && (
        <div className="text-center">
          <h2 className="kid-title text-4xl">ملك الغابة! 🦁👑</h2>
          <p className="mt-2 text-2xl font-black text-green-400">{score.toLocaleString("ar-EG")} نقطة</p>
          <button onClick={play} className="btn-kid mt-5 w-full">تحدي جديد 🔁</button>
        </div>
      )}
    </GameStage>
  );
}
