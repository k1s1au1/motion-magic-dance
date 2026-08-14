import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { LM } from "./landmarks";
import { OneEuro, clamp, lerp } from "./filter";
import {
  emptyInput,
  type CalibrationState,
  type Landmark,
  type Landmarks,
  type MotionEvent,
  type MotionEventType,
  type MotionInput,
} from "./types";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export type EngineStatus = "idle" | "loading" | "running" | "error";

const CONF = 0.5;

function vis(lm: Landmarks | null, id: number) {
  const p = lm?.[id];
  return p && (p.visibility ?? 1) > CONF ? p : null;
}

/**
 * Motion Tracking Engine
 * -----------------------------------------------------
 * الكاميرا = مستشعر فقط. تُقرأ الإطارات، تُستخرج المفاصل، ثم تُحوَّل
 * إلى MotionInput موحّد تستهلكه كل الألعاب. لا يوجد رسم للاعب إطلاقاً.
 *
 * تصحيح الاتجاه: الكاميرا الأمامية تعطي صورة معكوسة، لذلك نحوّل
 * إحداثيات x إلى "فضاء اللاعب" (x = 1 - imageX) مرة واحدة هنا فقط،
 * ونستخدم تسميات MediaPipe التشريحية كما هي: اليد اليمنى تبقى يمنى.
 */
export class MotionEngine {
  status: EngineStatus = "idle";
  error: string | null = null;
  input: MotionInput = emptyInput();
  events: MotionEvent[] = [];
  calibration: CalibrationState = {
    bodyInFrame: false,
    head: false,
    shoulders: false,
    hands: false,
    hips: false,
    feet: false,
    steady: false,
    progress: 0,
    ready: false,
  };

  private video: HTMLVideoElement | null = null;
  private landmarker: PoseLandmarker | null = null;
  private raf: number | null = null;
  private euro = new OneEuro();
  private lastVideoTime = -1;
  private lastTs = 0;
  private lm: Landmarks | null = null;
  private lostFor = 0;

  // مرجع المعايرة
  private baseX = 0.5;
  private baseHeadY = 0.35;
  private baseHipY = 0.6;
  private scale = 0.2;
  private samples = 0;
  private steadyTimer = 0;

  // حالات
  private prev = { lwx: 0, lwy: 0, rwx: 0, rwy: 0, bx: 0.5, by: 0.5 };
  private extL = 0;
  private extR = 0;
  private cooldown: Record<string, number> = {};
  private jumping = false;
  private squatting = false;
  private lane: -1 | 0 | 1 = 0;
  private listeners = new Set<() => void>();

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private notify() {
    this.listeners.forEach((f) => f());
  }

  async start(video: HTMLVideoElement) {
    this.video = video;
    this.error = null;
    this.status = "loading";
    this.notify();
    try {
      if (!this.landmarker) {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
        this.landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      }
      if (!video.srcObject) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
          audio: false,
        });
        video.srcObject = stream;
        await video.play();
      }
      this.status = "running";
      this.notify();
      if (this.raf === null) this.raf = requestAnimationFrame(this.loop);
    } catch (e) {
      this.error =
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "لازم تسمح للكاميرا عشان نقرأ حركتك 🙂"
          : "تعذّر تشغيل الكاميرا، جرّب مرة ثانية.";
      this.status = "error";
      this.notify();
    }
  }

  stop() {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    const stream = this.video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (this.video) this.video.srcObject = null;
    this.landmarker?.close();
    this.landmarker = null;
    this.status = "idle";
    this.notify();
  }

  recalibrate() {
    this.samples = 0;
    this.steadyTimer = 0;
    this.euro.reset();
    this.calibration = { ...this.calibration, ready: false, progress: 0, steady: false };
    this.notify();
  }

  /** تُستدعى من حلقة اللعبة: تُفرغ الأحداث المتراكمة منذ آخر إطار */
  drainEvents(): MotionEvent[] {
    if (!this.events.length) return [];
    const out = this.events;
    this.events = [];
    return out;
  }

  private emit(type: MotionEventType, power = 1, cd = 260) {
    const now = performance.now();
    if ((this.cooldown[type] ?? 0) > now) return;
    this.cooldown[type] = now + cd;
    this.events.push({ type, t: now, power });
    if (this.events.length > 24) this.events.shift();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const video = this.video;
    const landmarker = this.landmarker;
    if (!video || !landmarker || video.readyState < 2) return;

    const now = performance.now();
    const dt = this.lastTs ? Math.min(0.05, (now - this.lastTs) / 1000) : 1 / 60;
    this.lastTs = now;

    if (video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime;
      const res = landmarker.detectForVideo(video, now);
      const raw = res.landmarks?.[0] as Landmarks | undefined;
      if (raw && raw.length > 28) {
        this.lm = this.euro.filter(raw as Landmarks, dt);
        this.lostFor = 0;
      } else {
        this.lostFor += dt;
        if (this.lostFor > 0.5) {
          this.lm = null;
          this.euro.reset();
        }
      }
    }

    this.compute(dt);
  };

  private compute(dt: number) {
    const lm = this.lm;
    const inp = this.input;
    const nose = vis(lm, LM.nose);
    const ls = vis(lm, LM.lShoulder);
    const rs = vis(lm, LM.rShoulder);
    const lh = vis(lm, LM.lHip);
    const rh = vis(lm, LM.rHip);
    const lw = vis(lm, LM.lWrist);
    const rw = vis(lm, LM.rWrist);
    const la = vis(lm, LM.lAnkle);
    const ra = vis(lm, LM.rAnkle);

    const core = !!(nose && ls && rs && lh && rh);
    const cal = this.calibration;
    cal.head = !!nose;
    cal.shoulders = !!(ls && rs);
    cal.hands = !!(lw && rw);
    cal.hips = !!(lh && rh);
    cal.feet = !!(la || ra);
    cal.bodyInFrame = core && cal.feet;

    if (!core) {
      inp.tracked = false;
      inp.confidence = 0;
      inp.energy *= 0.9;
      if (!cal.ready) {
        this.steadyTimer = Math.max(0, this.steadyTimer - dt * 2);
        cal.steady = false;
        cal.progress = clamp(this.steadyTimer / 1.4);
      }
      return;
    }

    // === فضاء اللاعب: x معكوس عن صورة الكاميرا مرة واحدة فقط ===
    const px = (p: Landmark) => 1 - p.x;
    const shoulderW = Math.max(0.07, Math.abs(ls!.x - rs!.x));
    const headY = nose!.y;
    const hipY = (lh!.y + rh!.y) / 2;
    const bodyX = (px(lh!) + px(rh!)) / 2;

    if (!cal.ready) {
      const k = this.samples < 12 ? 0.35 : 0.08;
      this.baseX = lerp(this.baseX, bodyX, k);
      this.baseHeadY = lerp(this.baseHeadY, headY, k);
      this.baseHipY = lerp(this.baseHipY, hipY, k);
      this.scale = lerp(this.scale, shoulderW, k);
      this.samples++;
      const steady =
        this.samples > 18 &&
        cal.bodyInFrame &&
        Math.abs(bodyX - this.baseX) < this.scale * 0.3 &&
        Math.abs(headY - this.baseHeadY) < this.scale * 0.3 &&
        Math.abs(shoulderW - this.scale) < this.scale * 0.22;
      cal.steady = steady;
      this.steadyTimer = steady ? this.steadyTimer + dt : Math.max(0, this.steadyTimer - dt * 1.5);
      cal.progress = clamp(this.steadyTimer / 1.4);
      if (cal.progress >= 1) cal.ready = true;
    } else {
      // انجراف بطيء يحافظ على الدقة إن تحرّك اللاعب من مكانه
      this.baseX = lerp(this.baseX, bodyX, 0.004);
      this.scale = lerp(this.scale, shoulderW, 0.01);
    }

    const s = Math.max(0.07, this.scale);
    const gx = (x: number) => clamp(0.5 + (x - this.baseX) / (s * 3.0));
    const gy = (y: number) => clamp((y - (this.baseHeadY - s * 0.9)) / (s * 3.4));

    const hl = lw ? { x: gx(px(lw)), y: gy(lw.y) } : inp.handLeft;
    const hr = rw ? { x: gx(px(rw)), y: gy(rw.y) } : inp.handRight;
    const invDt = 1 / Math.max(dt, 0.008);
    inp.handLeftVel = { x: (hl.x - this.prev.lwx) * invDt, y: (hl.y - this.prev.lwy) * invDt };
    inp.handRightVel = { x: (hr.x - this.prev.rwx) * invDt, y: (hr.y - this.prev.rwy) * invDt };
    this.prev.lwx = hl.x;
    this.prev.lwy = hl.y;
    this.prev.rwx = hr.x;
    this.prev.rwy = hr.y;
    inp.handLeft = hl;
    inp.handRight = hr;

    const body = { x: gx(bodyX), y: gy(hipY) };
    inp.bodyVel = { x: (body.x - this.prev.bx) * invDt, y: (body.y - this.prev.by) * invDt };
    this.prev.bx = body.x;
    this.prev.by = body.y;
    inp.body = body;
    inp.head = { x: gx(px(nose!)), y: gy(headY) };
    inp.scale = s;
    inp.tracked = true;
    inp.confidence = clamp(((nose!.visibility ?? 1) + (ls!.visibility ?? 1) + (rs!.visibility ?? 1)) / 3);

    // ميلان الجذع
    inp.lean = clamp((px(nose!) - bodyX) / (s * 0.9), -1, 1);

    // قفز / انخفاض بحاجز هستيريسيس
    const dHead = headY - this.baseHeadY;
    const dHip = hipY - this.baseHipY;
    const wasJump = this.jumping;
    const wasSquat = this.squatting;
    this.jumping = this.jumping ? dHead < -s * 0.16 : dHead < -s * 0.4;
    this.squatting = this.squatting ? dHip > s * 0.22 : dHip > s * 0.5;
    if (this.jumping) this.squatting = false;
    if (this.jumping && !wasJump) this.emit("jump", clamp(-dHead / s), 400);
    if (this.squatting && !wasSquat) this.emit("squat", clamp(dHip / s), 400);
    inp.jump = this.jumping;
    inp.squat = this.squatting;

    // مسارات يمين/يسار
    const dx = body.x - 0.5;
    const enter = 0.16;
    const exit = 0.08;
    const prevLane = this.lane;
    if (this.lane === 0) this.lane = dx < -enter ? -1 : dx > enter ? 1 : 0;
    else if (this.lane === -1) this.lane = dx > -exit ? 0 : -1;
    else this.lane = dx < exit ? 0 : 1;
    if (this.lane !== prevLane) {
      this.emit(this.lane === -1 ? "moveLeft" : this.lane === 1 ? "moveRight" : "center", 1, 120);
    }
    inp.lane = this.lane;

    // لكمات: امتداد الذراع السريع
    const extend = (w: Landmark | null, sh: Landmark) =>
      w ? Math.hypot(px(w) - px(sh), w.y - sh.y) / s : 0;
    const eL = extend(lw, ls!);
    const eR = extend(rw, rs!);
    const vL = (eL - this.extL) / Math.max(dt, 0.008);
    const vR = (eR - this.extR) / Math.max(dt, 0.008);
    this.extL = eL;
    this.extR = eR;
    if (eL > 1.05 && vL > 2.2) this.emit("punchLeft", clamp(vL / 8), 240);
    if (eR > 1.05 && vR > 2.2) this.emit("punchRight", clamp(vR / 8), 240);

    // يدان مرفوعتان
    const up = !!(lw && rw && lw.y < nose!.y && rw.y < nose!.y);
    if (up && !inp.handsUp) this.emit("handsUp", 1, 500);
    inp.handsUp = up;

    const armV = clamp(
      (Math.hypot(inp.handLeftVel.x, inp.handLeftVel.y) + Math.hypot(inp.handRightVel.x, inp.handRightVel.y)) / 8,
    );
    inp.armVelocity = armV;
    inp.bodyVelocity = clamp(Math.hypot(inp.bodyVel.x, inp.bodyVel.y) / 3);
    inp.energy = clamp(inp.energy * 0.86 + Math.max(armV, inp.bodyVelocity) * 0.3);
  }
}
