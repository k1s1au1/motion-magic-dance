import { useCallback, useRef, useState } from "react";
import GameStage, { KidHud } from "./GameStage";
import { usePoseCamera, type FrameInfo } from "@/lib/usePoseCamera";
import { MOVES, type Move } from "@/lib/dance";

type KidPose = { move: Move; name: string; emoji: string; hint: string };

const KID_POSES: KidPose[] = [
  { id: "both-up", name: "الزرافة", emoji: "🦒", hint: "ارفع يديك فوق راسك مثل رقبة الزرافة" },
  { id: "t-pose", name: "الطيارة", emoji: "✈️", hint: "افرد ذراعيك مثل جناحين الطيارة" },
  { id: "clap", name: "السمكة", emoji: "🐟", hint: "اجمع يديك قدام صدرك مثل السمكة" },
  { id: "squat", name: "الضفدع", emoji: "🐸", hint: "انزل قرفصاء مثل الضفدع" },
  { id: "right-up", name: "الفيل", emoji: "🐘", hint: "ارفع يدك اليمنى مثل خرطوم الفيل" },
  { id: "left-up", name: "الأرنب", emoji: "🐰", hint: "ارفع يدك اليسرى مثل أذن الأرنب" },
  { id: "lean-right", name: "الشجرة يمين", emoji: "🌳", hint: "مِل بجسمك لليمين مثل الشجرة مع الهواء" },
  { id: "lean-left", name: "الشجرة يسار", emoji: "🌴", hint: "مِل بجسمك لليسار مثل النخلة" },
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
  }, []);

  const { videoRef, canvasRef, start, status, error, visible } = usePoseCamera(onFrame, "hsl(140 90% 65%)");

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
