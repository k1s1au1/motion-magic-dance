import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MotionEngine } from "./engine";

let singleton: MotionEngine | null = null;

/** محرك حركة واحد مشترك بين كل الألعاب (لا تبني تتبعاً خاصاً داخل اللعبة) */
export function getMotionEngine() {
  if (!singleton) singleton = new MotionEngine();
  return singleton;
}

/** يربط عنصر <video> مخفياً بالمحرك ويعيد الحالة التفاعلية */
export function useMotion() {
  const engine = getMotionEngine();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [, force] = useState(0);

  const status = useSyncExternalStore(
    (cb) => engine.subscribe(cb),
    () => engine.status,
    () => "idle" as const,
  );

  useEffect(() => {
    const v = videoRef.current;
    if (v) void engine.start(v);
    const id = window.setInterval(() => force((n) => n + 1), 100);
    return () => window.clearInterval(id);
  }, [engine]);

  return { engine, videoRef, status, error: engine.error, calibration: engine.calibration };
}
