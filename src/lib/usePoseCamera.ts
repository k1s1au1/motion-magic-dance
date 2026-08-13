import { useCallback, useEffect, useRef, useState } from "react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { poseVisible, type Landmarks, type Pt } from "@/lib/dance";
import { AVATAR_STYLES, drawAvatar, makeEnergyMeter, type AvatarStyle } from "@/lib/avatar";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export type PoseStatus = "idle" | "loading" | "ready" | "error";

export type FrameInfo = {
  lm: Landmarks | null;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  dt: number;
  now: number;
  /** true when a full body pose is currently detected (live value, safe inside callbacks) */
  visible: boolean;
  /** 0..1 motion energy (hand speed) for effects */
  energy: number;
};

export type PoseOptions = {
  /** مفتاح شكل الشخصية داخل اللعبة */
  avatar?: keyof typeof AVATAR_STYLES;
  /** ارسم الشخصية تلقائياً فوق مشهد اللعبة */
  drawCharacter?: boolean;
};

/** مرشّح تنعيم لكل مفصل: يقلل الاهتزاز مع إبقاء الاستجابة سريعة */
function smoothLandmarks(prev: Landmarks | null, next: Landmarks, alpha: number): Landmarks {
  if (!prev) return next.map((p) => ({ ...p }));
  return next.map((p, i) => {
    const q = prev[i] as Pt | undefined;
    if (!q) return { ...p };
    // تنعيم تكيّفي: الحركة السريعة تمر بأقل تأخير
    const speed = Math.hypot(p.x - q.x, p.y - q.y);
    const a = Math.min(1, alpha + speed * 6);
    const out: Pt = { x: q.x + (p.x - q.x) * a, y: q.y + (p.y - q.y) * a };
    if (p.visibility !== undefined) out.visibility = p.visibility;
    return out;
  });
}

/**
 * Motion tracking sensor مشترك لكل الألعاب.
 * الكاميرا تُقرأ فقط لاستخراج المفاصل — لا تُعرض داخل شاشة اللعب،
 * وبدلاً منها تُرسم شخصية اللعبة (Avatar) التي تقلّد حركة اللاعب.
 */
export function usePoseCamera(
  onFrame: (f: FrameInfo) => void,
  options?: PoseOptions | string,
) {
  const opts: PoseOptions = typeof options === "string" || !options ? {} : options;
  const style: AvatarStyle = AVATAR_STYLES[opts.avatar ?? "hero"] ?? AVATAR_STYLES["hero"]!;
  const drawCharacter = opts.drawCharacter !== false;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTime = useRef(-1);
  const lastLm = useRef<Landmarks | null>(null);
  const visibleRef = useRef(false);
  const lastTs = useRef(0);
  const frameRef = useRef(onFrame);
  frameRef.current = onFrame;
  const energyRef = useRef(makeEnergyMeter());
  const styleRef = useRef(style);
  styleRef.current = style;

  const [status, setStatus] = useState<PoseStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const loop = useCallback(() => {
    rafRef.current = requestAnimationFrame(loop);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !canvas || !landmarker || video.readyState < 2) return;

    if (video.videoWidth && canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (video.currentTime !== lastVideoTime.current) {
      lastVideoTime.current = video.currentTime;
      const res = landmarker.detectForVideo(video, performance.now());
      const lm = res.landmarks?.[0] as Landmarks | undefined;
      if (poseVisible(lm)) {
        lastLm.current = smoothLandmarks(lastLm.current, lm, 0.35);
        visibleRef.current = true;
        setVisible(true);
      } else {
        lastLm.current = null;
        visibleRef.current = false;
        setVisible(false);
      }
    }

    const now = performance.now();
    const dt = lastTs.current ? Math.min(0.05, (now - lastTs.current) / 1000) : 0;
    lastTs.current = now;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const lm = lastLm.current;
    const energy = energyRef.current(lm, dt);

    // مشهد اللعبة أولاً، ثم الشخصية فوقه (بلا أي بث كاميرا)
    frameRef.current({ lm, ctx, w, h, dt, now, visible: visibleRef.current, energy });

    if (drawCharacter && lm) {
      drawAvatar(ctx, lm, w, h, { style: styleRef.current, energy, shadow: true });
    }
  }, [drawCharacter]);

  const start = useCallback(async () => {
    setError(null);
    setStatus("loading");
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
      setStatus("ready");
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      console.error(e);
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "لازم تسمح للكاميرا عشان اللعبة تشوفك 🙂"
          : "ما قدرنا نشغّل الكاميرا. جرّب مرة ثانية.",
      );
      setStatus("error");
    }
  }, [loop]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, []);

  return { videoRef, canvasRef, start, status, error, visible, visibleRef };
}

/** Mirrored screen position (0..1) of a landmark, matching what the child sees. */
export function mirrored(pt: { x: number; y: number } | undefined) {
  if (!pt) return null;
  return { x: 1 - pt.x, y: pt.y };
}
