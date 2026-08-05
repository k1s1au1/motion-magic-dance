import { useCallback, useEffect, useRef, useState } from "react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { POSE_CONNECTIONS, poseVisible, type Landmarks } from "@/lib/dance";

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
};

/**
 * Shared camera + body tracking loop for the kids games.
 * Draws a friendly skeleton then hands the frame to the game via onFrame.
 */
export function usePoseCamera(onFrame: (f: FrameInfo) => void, skeletonColor = "hsl(190 100% 65%)") {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTime = useRef(-1);
  const lastLm = useRef<Landmarks | null>(null);
  const lastTs = useRef(0);
  const frameRef = useRef(onFrame);
  frameRef.current = onFrame;

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
        lastLm.current = lm;
        setVisible(true);
      } else {
        lastLm.current = null;
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
    if (lm) {
      // mirror the skeleton so it lines up with the mirrored video
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.shadowColor = skeletonColor;
      ctx.shadowBlur = 16;
      ctx.strokeStyle = skeletonColor;
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
      ctx.fillStyle = skeletonColor;
      for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
        const pt = lm[i];
        if (!pt) continue;
        ctx.beginPath();
        ctx.arc(pt.x * w, pt.y * h, i === 0 ? w * 0.038 : w * 0.015, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    frameRef.current({ lm, ctx, w, h, dt, now });
  }, [skeletonColor]);

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

  return { videoRef, canvasRef, start, status, error, visible };
}

/** Mirrored screen position (0..1) of a landmark, matching what the child sees. */
export function mirrored(pt: { x: number; y: number } | undefined) {
  if (!pt) return null;
  return { x: 1 - pt.x, y: pt.y };
}
