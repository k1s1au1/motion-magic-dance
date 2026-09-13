import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useMotion } from "@/motion/useMotion";
import { Fx3D, type FloatText } from "@/engine/fx3d";
import { FxLayer } from "@/engine/FxLayer";
import { audio } from "@/engine/audio";
import { Score, readBest, writeBest } from "@/engine/score";
import { DIFFICULTY, WORLD, type Difficulty, type Frame3D, type GameDef } from "@/engine/game";
import { emptyInput } from "@/motion/types";
import { CalibrationOverlay } from "./CalibrationOverlay";
import { Hud } from "./Hud";
import { ResultCard } from "./ResultCard";

type Phase = "calibrate" | "countdown" | "play" | "done";

const DIFF_KEY = "motion-arcade-difficulty";

/** ضباب يتبع مسافة الكاميرا حتى لا يختفي المشهد على الشاشات الطويلة */
function FogFit({ color, depth }: { color: string; depth: number }) {
  const { scene, camera } = useThree();
  useEffect(() => {
    const z = camera.position.z;
    scene.fog = new THREE.Fog(color, z + 1.5, z + depth);
    return () => {
      scene.fog = null;
    };
  }, [scene, camera, color, depth]);
  return null;
}

/** يحدّث إطار اللعب مرة واحدة قبل تشغيل مشهد اللعبة */
function Driver({
  frameRef,
  getInput,
  drain,
  onFinish,
}: {
  frameRef: React.MutableRefObject<Frame3D>;
  getInput: () => Frame3D["input"];
  drain: () => Frame3D["events"];
  onFinish: () => void;
}) {
  const { camera, size } = useThree();
  const base = useRef(new THREE.Vector3());
  const done = useRef(false);

  // ملاءمة الكاميرا حتى تظهر مساحة اللعب كاملة على أي شاشة
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const half = Math.tan(((cam.fov * Math.PI) / 180) / 2);
    const aspect = size.width / Math.max(1, size.height);
    const distH = WORLD.h / 2 / half;
    const distW = WORLD.w / 2 / (half * aspect);
    cam.position.z = Math.max(cam.position.z, distH, distW) * 1.02;
    cam.updateProjectionMatrix();
    base.current.copy(cam.position);
  }, [camera, size.width, size.height]);

  useFrame((_, delta) => {
    const dt = Math.min(0.05, delta);
    const f = frameRef.current;
    f.dt = dt;
    f.t += dt;
    f.input = getInput();
    f.events = drain();
    f.score.tick(dt);
    f.fx.update(dt);

    const s = f.fx.shake;
    camera.position.set(
      base.current.x + (Math.random() - 0.5) * s * 0.5,
      base.current.y + (Math.random() - 0.5) * s * 0.5,
      base.current.z,
    );

    if (f.score.finished && !done.current) {
      done.current = true;
      onFinish();
    }
  });

  return null;
}

export function GameScreen({ game }: { game: GameDef }) {
  const navigate = useNavigate();
  const { engine, videoRef, status, error, calibration } = useMotion();
  const [phase, setPhase] = useState<Phase>("calibrate");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [runId, setRunId] = useState(0);
  const [hud, setHud] = useState({ points: 0, combo: 0, timeLeft: game.duration, tracked: false });
  const [overlay, setOverlay] = useState<{ texts: FloatText[]; flash: number; flashColor: string }>({
    texts: [],
    flash: 0,
    flashColor: "255,255,255",
  });
  const [result, setResult] = useState<{ points: number; best: number; accuracy: number; bestCombo: number; stars: number } | null>(
    null,
  );
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");

  const frameRef = useRef<Frame3D>({
    dt: 0,
    t: 0,
    input: emptyInput(),
    events: [],
    fx: new Fx3D(),
    score: new Score(game.duration),
    diff: DIFFICULTY.normal,
  });

  useEffect(() => {
    const saved = window.localStorage.getItem(DIFF_KEY) as Difficulty | null;
    if (saved && DIFFICULTY[saved]) {
      setDifficulty(saved);
      frameRef.current.diff = DIFFICULTY[saved];
    }
  }, []);

  const setDiff = (d: Difficulty) => {
    setDifficulty(d);
    frameRef.current.diff = DIFFICULTY[d];
    window.localStorage.setItem(DIFF_KEY, d);
  };

  const startRun = () => {
    frameRef.current.score = new Score(game.duration);
    frameRef.current.fx = new Fx3D();
    frameRef.current.t = 0;
    frameRef.current.events = [];
    setResult(null);
    setHud({ points: 0, combo: 0, timeLeft: game.duration, tracked: false });
    setRunId((n) => n + 1);
    setPhase("play");
    audio.startMusic(frameRef.current.diff.speed > 1.1 ? 148 : 126);
  };

  // وضع تجريبي لفحص الجرافيكس بدون معايرة (?demo=1)
  const demo = typeof window !== "undefined" && window.location.search.includes("demo=1");

  // العد التنازلي بعد المعايرة (يبدأ مرة واحدة فقط ولا يتأثر بإعادة الرسم)
  const readyRef = useRef(false);
  readyRef.current = calibration.ready || demo;
  const startRef = useRef(startRun);
  startRef.current = startRun;

  useEffect(() => {
    let watcher = 0;
    let ticker = 0;
    let timer = 0;
    const begin = () => {
      setPhase("countdown");
      audio.unlock();
      let n = 3;
      setCountdown(n);
      audio.count(n);
      ticker = window.setInterval(() => {
        n--;
        setCountdown(n);
        audio.count(n);
        if (n === 0) {
          window.clearInterval(ticker);
          timer = window.setTimeout(() => {
            setCountdown(null);
            startRef.current();
          }, 450);
        }
      }, 800);
    };
    watcher = window.setInterval(() => {
      if (readyRef.current) {
        window.clearInterval(watcher);
        begin();
      }
    }, 150);
    return () => {
      window.clearInterval(watcher);
      window.clearInterval(ticker);
      window.clearTimeout(timer);
    };
  }, []);

  // مزامنة الواجهة مع حالة اللعب
  useEffect(() => {
    if (phase !== "play") return;
    const id = window.setInterval(() => {
      const f = frameRef.current;
      setHud({ points: f.score.points, combo: f.score.combo, timeLeft: f.score.timeLeft, tracked: engine.input.tracked });
      setOverlay({ texts: [...f.fx.texts], flash: f.fx.flash, flashColor: f.fx.flashColor });
    }, 80);
    return () => window.clearInterval(id);
  }, [phase, engine]);

  useEffect(() => () => audio.stopMusic(), []);

  const finish = () => {
    const s = frameRef.current.score;
    audio.stopMusic();
    audio.say(s.accuracy > 60 ? "أداء رائع" : "حاول مرة ثانية");
    const best = writeBest(game.id, s.points);
    setResult({ points: s.points, best, accuracy: s.accuracy, bestCombo: s.bestCombo, stars: s.stars });
    setPhase("done");
  };

  const bestKnown = useMemo(() => readBest(game.id), [game.id]);

  const exit = () => {
    audio.stopMusic();
    void navigate({ to: "/" });
  };

  const GameScene = game.Scene;
  const getFrame = () => frameRef.current;
  const cam = game.camera ?? [0, 0.6, 8];

  return (
    <div dir="rtl" className="relative h-[100dvh] w-full overflow-hidden select-none" style={{ background: game.bg }}>
      {(phase === "play" || phase === "done") && (
        <Canvas
          key={runId}
          className="absolute inset-0"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          shadows
          dpr={[1, 1.6]}
          camera={{ position: cam, fov: 62 }}
          gl={{ antialias: true, powerPreference: "high-performance" }}
        >
          <color attach="background" args={[game.bg]} />
          <FogFit color={game.bg} depth={(game.fogFar ?? 32) - (game.fogNear ?? 10) + 12} />
          <Driver
            frameRef={frameRef}
            getInput={() => engine.input}
            drain={() => engine.drainEvents()}
            onFinish={finish}
          />
          <GameScene frame={getFrame} />
          <FxLayer fx={frameRef.current.fx} />
        </Canvas>
      )}

      {/* وميض وتغذية راجعة نصية */}
      {phase === "play" && (
        <>
          <div
            className="pointer-events-none absolute inset-0 z-20"
            style={{ background: `rgba(${overlay.flashColor},${overlay.flash})` }}
          />
          <div className="pointer-events-none absolute inset-0 z-20">
            {overlay.texts.map((t) => (
              <span
                key={t.id}
                className="absolute -translate-x-1/2 text-3xl font-black drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]"
                style={{
                  left: `${t.x * 100}%`,
                  top: `${t.y * 100 - t.life * 8}%`,
                  color: t.color,
                  opacity: Math.max(0, 1 - t.life),
                }}
              >
                {t.msg}
              </span>
            ))}
          </div>
        </>
      )}

      {(phase === "play" || phase === "done") && (
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
          <CalibrationOverlay calibration={calibration} status={status} error={error} countdown={countdown} />
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
          onReplay={startRun}
          onExit={exit}
        />
      )}

      {/* الكاميرا مستشعر فقط: معاينة صغيرة أثناء المعايرة، ومخفية تماماً أثناء اللعب */}
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
