import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMotion } from "@/motion/useMotion";
import { Vfx } from "@/engine/vfx";
import { audio } from "@/engine/audio";
import { Score, readBest, writeBest } from "@/engine/score";
import { DIFFICULTY, type Difficulty, type Frame, type GameDef, type GameInstance } from "@/engine/game";
import { CalibrationOverlay } from "./CalibrationOverlay";
import { Hud } from "./Hud";
import { ResultCard } from "./ResultCard";

type Phase = "calibrate" | "countdown" | "play" | "done";

const DIFF_KEY = "motion-arcade-difficulty";

export function GameScreen({ game }: { game: GameDef }) {
  const navigate = useNavigate();
  const { engine, videoRef, status, error, calibration } = useMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>("calibrate");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [hud, setHud] = useState({ points: 0, combo: 0, timeLeft: game.duration, tracked: false });
  const [result, setResult] = useState<{ points: number; best: number; accuracy: number; bestCombo: number; stars: number } | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");

  const scoreRef = useRef<Score | null>(null);
  const instRef = useRef<GameInstance | null>(null);
  const vfxRef = useRef(new Vfx());
  const diffRef = useRef(DIFFICULTY.normal);

  useEffect(() => {
    const saved = window.localStorage.getItem(DIFF_KEY) as Difficulty | null;
    if (saved && DIFFICULTY[saved]) {
      setDifficulty(saved);
      diffRef.current = DIFFICULTY[saved];
    }
  }, []);

  const setDiff = (d: Difficulty) => {
    setDifficulty(d);
    diffRef.current = DIFFICULTY[d];
    window.localStorage.setItem(DIFF_KEY, d);
  };

  // بدء العد التنازلي بعد نجاح المعايرة
  useEffect(() => {
    if (phase !== "calibrate" || !calibration.ready) return;
    setPhase("countdown");
    audio.unlock();
    let n = 3;
    setCountdown(n);
    audio.count(n);
    const id = window.setInterval(() => {
      n--;
      setCountdown(n);
      audio.count(n);
      if (n === 0) {
        window.clearInterval(id);
        window.setTimeout(() => {
          scoreRef.current = new Score(game.duration);
          instRef.current = game.create();
          vfxRef.current = new Vfx();
          setCountdown(null);
          setPhase("play");
          audio.startMusic(diffRef.current.speed > 1.1 ? 148 : 126);
        }, 450);
      }
    }, 800);
    return () => window.clearInterval(id);
  }, [calibration.ready, phase, game]);

  // حلقة اللعب والرسم
  useEffect(() => {
    if (phase !== "play") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();
    let t = 0;
    let hudAcc = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;

      const score = scoreRef.current;
      const inst = instRef.current;
      if (!score || !inst) return;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const vfx = vfxRef.current;
      score.tick(dt);

      const frame: Frame = {
        ctx,
        w,
        h,
        dt,
        t,
        input: engine.input,
        events: engine.drainEvents(),
        vfx,
        score,
        diff: diffRef.current,
      };

      ctx.save();
      if (vfx.shake > 0.4) {
        ctx.translate((Math.random() - 0.5) * vfx.shake, (Math.random() - 0.5) * vfx.shake);
      }
      inst.step(frame);
      vfx.update(dt);
      vfx.draw(ctx);
      ctx.restore();

      if (vfx.flash > 0.01) {
        ctx.fillStyle = `rgba(${vfx.flashColor},${vfx.flash})`;
        ctx.fillRect(0, 0, w, h);
      }

      hudAcc += dt;
      if (hudAcc > 0.1) {
        hudAcc = 0;
        setHud({ points: score.points, combo: score.combo, timeLeft: score.timeLeft, tracked: engine.input.tracked });
      }

      if (score.finished) {
        cancelAnimationFrame(raf);
        audio.stopMusic();
        audio.say(score.accuracy > 60 ? "أداء رائع" : "حاول مرة ثانية");
        const best = writeBest(game.id, score.points);
        setResult({
          points: score.points,
          best,
          accuracy: score.accuracy,
          bestCombo: score.bestCombo,
          stars: score.stars,
        });
        setPhase("done");
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      audio.stopMusic();
    };
  }, [phase, engine, game]);

  useEffect(() => () => audio.stopMusic(), []);

  const bestKnown = useMemo(() => readBest(game.id), [game.id]);

  const replay = () => {
    setResult(null);
    setHud({ points: 0, combo: 0, timeLeft: game.duration, tracked: false });
    scoreRef.current = new Score(game.duration);
    instRef.current = game.create();
    vfxRef.current = new Vfx();
    setPhase("play");
    audio.startMusic(diffRef.current.speed > 1.1 ? 148 : 126);
  };

  const exit = () => {
    audio.stopMusic();
    void navigate({ to: "/" });
  };

  return (
    <div className="stage relative h-[100dvh] w-full overflow-hidden select-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {phase !== "calibrate" && phase !== "countdown" && (
        <Hud
          title={`${game.emoji} ${game.title}`}
          points={hud.points}
          combo={hud.combo}
          timeLeft={hud.timeLeft}
          duration={game.duration}
          tracked={hud.tracked}
          onExit={exit}
        />
      )}

      {(phase === "calibrate" || phase === "countdown") && (
        <>
          <CalibrationOverlay
            calibration={calibration}
            status={status}
            error={error}
            countdown={countdown}
          />
          {phase === "calibrate" && (
            <div className="absolute inset-x-0 bottom-6 z-30 flex flex-col items-center gap-2">
              <span className="text-xs text-muted-foreground">مستوى الصعوبة</span>
              <div className="flex gap-2">
                {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDiff(d)}
                    className={`rounded-full px-4 py-2 text-sm font-bold ${
                      difficulty === d
                        ? "bg-[color:var(--neon-cyan)] text-black"
                        : "border border-[oklch(1_0_0/0.18)] text-foreground"
                    }`}
                  >
                    {DIFFICULTY[d].label}
                  </button>
                ))}
              </div>
              <p className="mt-1 max-w-xs text-center text-xs text-muted-foreground">{game.howto}</p>
              <button onClick={exit} className="mt-1 text-xs text-muted-foreground underline">
                رجوع
              </button>
            </div>
          )}
        </>
      )}

      {phase === "done" && result && (
        <ResultCard
          title={game.title}
          points={result.points}
          best={Math.max(result.best, bestKnown)}
          accuracy={result.accuracy}
          bestCombo={result.bestCombo}
          stars={result.stars}
          onReplay={replay}
          onExit={exit}
        />
      )}

      {/* عنصر الكاميرا الوحيد: مستشعر فقط، ويظهر كمعاينة صغيرة أثناء المعايرة */}
      <div
        className={
          phase === "calibrate"
            ? "absolute bottom-40 left-1/2 z-30 h-44 w-32 -translate-x-1/2 overflow-hidden rounded-3xl border-2 border-[oklch(1_0_0/0.2)] bg-black/50"
            : "pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
        }
      >
        <video ref={videoRef} playsInline muted className="h-full w-full scale-x-[-1] object-cover opacity-80" />
        {phase === "calibrate" && (
          <div className="pointer-events-none absolute inset-3 rounded-2xl border-2 border-dashed border-[color:var(--neon-cyan)]/70" />
        )}
      </div>
    </div>
  );
}
