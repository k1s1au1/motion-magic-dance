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
type Leaf = { x: number; y: number; r: number; vx: number; vy: number; rotation: number; dr: number; color: string };

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
    return move ? { move, name: k.name, emoji: k.emoji, hint: k.hint } : null;
  })
  .filter(Boolean) as KidPose[];

const HOLD_MS = 900;
const ROUND_MS = 12000;
const ROUNDS = 6;

export default function AnimalPoses({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<"idle" | "playing" | "finished">("idle");
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(1);
  const [target, setTarget] = useState<KidPose | null>(null);
  const [match, setMatch] = useState(0);
  const [hold, setHold] = useState(0);
  const [win, setWin] = useState(false);

  const phaseRef = useRef<"idle" | "playing" | "finished">("idle");
  const orderRef = useRef<KidPose[]>([]);
  const idxRef = useRef(0);
  const holdRef = useRef(0);
  const roundEnd = useRef(0);
  const leaves = useRef<Leaf[]>([]);

  const nextRound = (now: number) => {
    idxRef.current += 1;
    holdRef.current = 0;
    setHold(0);
    setWin(false);
    if (idxRef.current >= orderRef.current.length) {
      phaseRef.current = "finished";
      setPhase("finished");
      setTarget(null);
      return;
    }
    setRound(idxRef.current + 1);
    setTarget(orderRef.current[idxRef.current] ?? null);
    roundEnd.current = now + ROUND_MS;
  };

  const onFrame = useCallback(({ lm, ctx, w, h, now }: FrameInfo) => {
    // Nature Particles Update
    if (leaves.current.length < 15) {
      leaves.current.push({
        x: Math.random() * w, y: -20,
        r: 10 + Math.random() * 15,
        vx: (Math.random() - 0.5) * 2,
        vy: 1 + Math.random() * 2,
        rotation: Math.random() * Math.PI * 2,
        dr: (Math.random() - 0.5) * 0.1,
        color: `hsl(${20 + Math.random() * 100}, 70%, 40%)`
      });
    }
    leaves.current.forEach(l => {
      l.x += l.vx + Math.sin(now * 0.001) * 0.5;
      l.y += l.vy;
      l.rotation += l.dr;
      if (l.y > h + 20) l.y = -20;
    });

    if (phaseRef.current !== "playing") return;
    const pose = orderRef.current[idxRef.current];
    if (!pose) return;

    const q = lm ? Math.max(0, Math.min(1, pose.move.match(lm))) : 0;
    setMatch(q);

    if (q > 0.62) {
      holdRef.current += 16.7;
      setHold(Math.min(1, holdRef.current / HOLD_MS));
      if (holdRef.current >= HOLD_MS) {
        setScore((s) => s + 800 + Math.round(q * 400));
        setWin(true);
        audio.playSuccess();
        ctx.save();
        ctx.font = `bold ${w * 0.12}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = "hsl(140 90% 60%)";
        ctx.fillText("ممتاز! 🌟", w / 2, h * 0.5);
        ctx.restore();
        nextRound(now);
        return;
      }
    } else {
      holdRef.current = Math.max(0, holdRef.current - 8);
      setHold(Math.min(1, holdRef.current / HOLD_MS));
    }

    if (now >= roundEnd.current) nextRound(now);

    // 3. Drawing
    // Draw Nature Particles
    leaves.current.forEach(l => {
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(l.rotation);
      ctx.fillStyle = l.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, l.r, l.r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      // Leaf vein
      ctx.strokeStyle = "rgba(0,0,0,0.1)";
      ctx.beginPath(); ctx.moveTo(-l.r, 0); ctx.lineTo(l.r, 0); ctx.stroke();
      ctx.restore();
    });

    // Silhouette (Ghost Skeleton)
    if (pose && pose.silhouette) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      ctx.setLineDash([8, 4]);
      ctx.lineWidth = 10;
      ctx.lineCap = "round";

      const sil = pose.silhouette;
      const conn: [number, number][] = [[11,12], [11,13], [13,15], [12,14], [14,16], [11,23], [12,24], [23,24]];
      conn.forEach(([a, b]) => {
        if (sil[a] && sil[b]) {
          ctx.beginPath();
          ctx.moveTo(sil[a].x * w, sil[a].y * h);
          ctx.lineTo(sil[b].x * w, sil[b].y * h);
          ctx.stroke();
        }
      });
      ctx.restore();
    }

    // Actual Skeleton with Glow if matching
    if (lm) {
      ctx.save();
      const glow = match > 0.6 ? "0 0 25px hsl(140 90% 60%)" : "none";
      ctx.strokeStyle = match > 0.6 ? "hsl(140 90% 60%)" : "white";
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      const conn: [number, number][] = [[11,12], [11,13], [13,15], [12,14], [14,16], [11,23], [12,24], [23,24], [23,25], [24,26]];
      conn.forEach(([a, b]) => {
        if (lm[a] && lm[b]) {
          ctx.beginPath();
          ctx.moveTo(lm[a].x * w, lm[a].y * h);
          ctx.lineTo(lm[b].x * w, lm[b].y * h);
          ctx.stroke();
        }
      });
      ctx.restore();
    }
  }, []);

  const { videoRef, canvasRef, start, status, error, visible } = usePoseCamera(onFrame, "hsl(140 90% 65%)");

  useEffect(() => {
    return () => {
      audio.stopMusic();
    };
  }, []);

  const play = async () => {
    await start();
    const shuffled = [...KID_POSES].sort(() => Math.random() - 0.5).slice(0, ROUNDS);
    orderRef.current = shuffled;
    idxRef.current = 0;
    holdRef.current = 0;
    setScore(0);
    setHold(0);
    setWin(false);
    setRound(1);
    setTarget(shuffled[0] ?? null);
    roundEnd.current = performance.now() + ROUND_MS;
    phaseRef.current = "playing";
    setPhase("playing");
    audio.startKidsMusic();
  };

  return (
    <GameStage
      videoRef={videoRef}
      canvasRef={canvasRef}
      title="قلّد الحيوان"
      emoji="🦒"
      onBack={onBack}
      hud={
        phase === "playing" ? (
          <>
            <KidHud label="النقاط" value={score.toLocaleString("ar-EG")} />
            <KidHud label="الجولة" value={`${round}/${orderRef.current.length || ROUNDS}`} />
          </>
        ) : null
      }
      banner={
        phase === "playing" && target ? (
          <div className="relative mt-3 px-5 text-center">
            <div className={`kid-banner kid-banner-dance ${win ? "kid-win" : ""}`}>
              <span className="text-3xl">{target.emoji}</span> {target.name}
            </div>
            <p className="mt-2 text-sm font-bold text-foreground">{target.hint}</p>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-white/15">
              <div className="kid-bar h-full" style={{ width: `${match * 100}%` }} />
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/15">
              <div className="kid-bar-hold h-full" style={{ width: `${hold * 100}%` }} />
            </div>
          </div>
        ) : null
      }
    >
      {phase === "idle" && (
        <div className="text-center">
          <h2 className="kid-title text-3xl">قلّد الحيوان 🦒</h2>
          <p className="mt-2 text-sm text-muted-foreground">سوّ نفس وقفة الحيوان واثبت شوي… والكاميرا تشوفك!</p>
          {error && <p className="mt-3 text-sm text-[var(--kid-red)]">{error}</p>}
          <button onClick={play} disabled={status === "loading"} className="btn-kid mt-5 w-full">
            {status === "loading" ? "جاري التجهيز…" : "يلا نبدأ!"}
          </button>
        </div>
      )}
      {phase === "playing" && (
        <p className="text-center text-xs text-muted-foreground">{visible ? "ثبّت على الوقفة شوي 👌" : "ابعد شوي عشان يبين جسمك كامل 🙂"}</p>
      )}
      {phase === "finished" && (
        <div className="text-center">
          <h2 className="kid-title text-3xl">بطل! 🎉</h2>
          <p className="mt-2 text-lg font-bold">{score.toLocaleString("ar-EG")} نقطة</p>
          <button onClick={play} className="btn-kid mt-5 w-full">
            العب مرة ثانية 🔁
          </button>
        </div>
      )}
    </GameStage>
  );
}
