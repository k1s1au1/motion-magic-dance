import { useCallback, useEffect, useRef, useState } from "react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { POSE_CONNECTIONS, makeRoutine, poseVisible, rating, type Landmarks, type Move } from "@/lib/dance";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const MOVE_MS = 4000;

type Phase = "idle" | "loading" | "playing" | "finished";

export default function DanceGame() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTime = useRef(-1);
  const bestRef = useRef(0);
  const moveStart = useRef(0);
  const routineRef = useRef<Move[]>([]);
  const indexRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(0);
  const [progress, setProgress] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [current, setCurrent] = useState<Move | null>(null);
  const [next, setNext] = useState<Move | null>(null);
  const [flash, setFlash] = useState<{ label: string; cls: string; key: number } | null>(null);
  const [detected, setDetected] = useState(false);

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const draw = useCallback((lm: Landmarks | null, quality: number) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    if (!lm) return;

    const hue = 140 + quality * 60;
    const color = quality > 0.65 ? `hsl(${hue} 100% 60%)` : quality > 0.35 ? "hsl(45 100% 60%)" : "hsl(330 100% 65%)";
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(4, w * 0.012);
    ctx.lineCap = "round";
    for (const [a, b] of POSE_CONNECTIONS) {
      const pa = lm[a];
      const pb = lm[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x * w, pa.y * h);
      ctx.lineTo(pb.x * w, pb.y * h);
      ctx.stroke();
    }
    ctx.fillStyle = color;
    for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
      const pt = lm[i];
      if (!pt) continue;
      ctx.beginPath();
      ctx.arc(pt.x * w, pt.y * h, i === 0 ? w * 0.035 : w * 0.014, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }, []);

  const loop = useCallback(() => {
    rafRef.current = requestAnimationFrame(loop);
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    const canvas = canvasRef.current;
    if (!video || !landmarker || !canvas || video.readyState < 2) return;

    if (canvas.width !== video.videoWidth && video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    let quality = 0;
    if (video.currentTime !== lastVideoTime.current) {
      lastVideoTime.current = video.currentTime;
      const res = landmarker.detectForVideo(video, performance.now());
      const lm = res.landmarks?.[0] as Landmarks | undefined;
      if (poseVisible(lm)) {
        const move = routineRef.current[indexRef.current];
        quality = move ? Math.max(0, Math.min(1, move.match(lm))) : 0;
        setDetected(true);
        setLive(quality);
        if (phaseRef.current === "playing" && quality > bestRef.current) bestRef.current = quality;
        draw(lm, quality);
      } else {
        setDetected(false);
        setLive(0);
        draw(null, 0);
      }
    }

    if (phaseRef.current === "playing") {
      const elapsed = performance.now() - moveStart.current;
      setProgress(Math.min(1, elapsed / MOVE_MS));
      if (elapsed >= MOVE_MS) {
        const r = rating(bestRef.current);
        setFlash({ label: r.label, cls: r.cls, key: performance.now() });
        setCombo((c) => {
          const nc = r.points > 0 ? c + 1 : 0;
          setBestCombo((b) => Math.max(b, nc));
          setScore((s) => s + r.points + (r.points > 0 ? nc * 50 : 0));
          return nc;
        });
        bestRef.current = 0;
        indexRef.current += 1;
        moveStart.current = performance.now();
        const routine = routineRef.current;
        if (indexRef.current >= routine.length) {
          setPhaseBoth("finished");
          setCurrent(null);
          setNext(null);
        } else {
          setCurrent(routine[indexRef.current] ?? null);
          setNext(routine[indexRef.current + 1] ?? null);
        }
      }
    }
  }, [draw]);

  const start = useCallback(async () => {
    setError(null);
    setPhaseBoth("loading");
    try {
      if (!landmarkerRef.current) {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
        landmarkerRef.current = await vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      }
      if (!videoRef.current?.srcObject) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      }
      const routine = makeRoutine(12);
      routineRef.current = routine;
      indexRef.current = 0;
      bestRef.current = 0;
      moveStart.current = performance.now();
      setScore(0);
      setCombo(0);
      setBestCombo(0);
      setProgress(0);
      setCurrent(routine[0] ?? null);
      setNext(routine[1] ?? null);
      setPhaseBoth("playing");
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      console.error(e);
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "لازم تسمح للكاميرا عشان اللعبة تشوف حركاتك."
          : "ما قدرنا نشغل الكاميرا أو نحمّل نظام التتبع. جرّب مرة ثانية.",
      );
      setPhaseBoth("idle");
    }
  }, [loop]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
      landmarkerRef.current?.close();
    };
  }, []);

  const stars = score >= 9000 ? 5 : score >= 7000 ? 4 : score >= 5000 ? 3 : score >= 3000 ? 2 : 1;

  return (
    <div className="stage relative mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-hidden">
      <div className="relative flex-1">
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full scale-x-[-1] object-cover opacity-70" />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,transparent,var(--color-background))]" />

        {/* HUD */}
        <div className="relative flex items-start justify-between p-4">
          <div className="hud-card">
            <span className="hud-label">النقاط</span>
            <span className="hud-value">{score.toLocaleString("ar-EG")}</span>
          </div>
          <div className="hud-card items-end">
            <span className="hud-label">سلسلة</span>
            <span className="hud-value">×{combo}</span>
          </div>
        </div>

        {phase === "playing" && current && (
          <div className="relative mt-2 px-5 text-center">
            <div className="move-chip">
              <span className="text-3xl">{current.emoji}</span>
              <span className="text-lg font-bold">{current.name}</span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className="beat-bar h-full" style={{ width: `${(1 - progress) * 100}%` }} />
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className="match-bar h-full" style={{ width: `${live * 100}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {detected ? `تطابق الحركة ${Math.round(live * 100)}%` : "ابعد شوي عن الجوال عشان يبين جسمك كامل"}
            </p>
            {next && (
              <p className="mt-1 text-xs text-muted-foreground">
                التالي: {next.emoji} {next.name}
              </p>
            )}
          </div>
        )}

        {flash && (
          <div key={flash.key} className={`pop pointer-events-none absolute inset-x-0 top-1/3 text-center text-4xl font-black ${flash.cls}`}>
            {flash.label}
          </div>
        )}
      </div>

      {/* Bottom panel */}
      <div className="relative z-10 p-5 pb-8">
        {phase === "idle" && (
          <div className="text-center">
            <h1 className="title-glow text-4xl font-black">رقص المرايا</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              شغّل الكاميرا، قلّد الحركة اللي تطلع لك، والكاميرا تتابع جسمك وتحسب نقاطك.
            </p>
            {error && <p className="mt-3 text-sm text-[var(--neon-pink)]">{error}</p>}
            <button onClick={start} className="btn-neon mt-5 w-full">
              ابدأ الرقص 💃
            </button>
            <Link to="/kids" className="btn-kid mt-3 block w-full text-center">
              ألعاب الصغار 🎪
            </Link>
          </div>
        )}
        {phase === "loading" && <p className="text-center text-sm text-muted-foreground">جاري تجهيز الكاميرا والتتبع…</p>}
        {phase === "playing" && (
          <p className="text-center text-xs text-muted-foreground">
            الحركة {indexRef.current + 1} من {routineRef.current.length}
          </p>
        )}
        {phase === "finished" && (
          <div className="text-center">
            <h2 className="title-glow text-3xl font-black">انتهت الأغنية!</h2>
            <p className="mt-2 text-5xl">{"⭐".repeat(stars)}</p>
            <p className="mt-2 text-lg font-bold">{score.toLocaleString("ar-EG")} نقطة</p>
            <p className="text-sm text-muted-foreground">أطول سلسلة: ×{bestCombo}</p>
            <button onClick={start} className="btn-neon mt-5 w-full">
              العب مرة ثانية 🔁
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
