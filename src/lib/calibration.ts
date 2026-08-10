import { L, type Landmarks } from "@/lib/dance";

export type Pt = { x: number; y: number };

/** مرشّح تنعيم بسيط (يقلل رجفة النقاط القادمة من الكاميرا) */
export function makeSmoother(alpha = 0.45) {
  let prev: Pt | null = null;
  return (p: Pt | null): Pt | null => {
    if (!p) {
      prev = null;
      return null;
    }
    prev = prev ? { x: prev.x + (p.x - prev.x) * alpha, y: prev.y + (p.y - prev.y) * alpha } : p;
    return prev;
  };
}

export type CalibState = {
  /** انتهت المعايرة بنجاح */
  ready: boolean;
  /** 0..1 لعرض شريط التقدم */
  progress: number;
  /** الجسم ثابت داخل الإطار */
  steady: boolean;
  /** عرض الأكتاف = مقياس الجسم (يجعل الحساسية مستقلة عن بعد الطفل) */
  scale: number;
  /** إزاحة الرأس أفقياً/عمودياً بالنسبة لوضع المعايرة */
  dx: number;
  dy: number;
  /** موضع الرأس الأساسي المُعاير */
  baseY: number;
  baseX: number;
  jumping: boolean;
  ducking: boolean;
  lane: 0 | 1 | 2;
};

/**
 * معايرة مشتركة لكل ألعاب الكاميرا:
 * - متوسط متحرك لموضع الرأس وعرض الأكتاف أثناء وقوف الطفل
 * - تتطلب ثبات الجسم فعلياً (وليس مجرد ظهوره) قبل بدء اللعب
 * - عتبات قفز/انخفاض/تنقّل بحاجز هستيريسيس يمنع الاهتزاز بين الحالات
 */
export function createCalibrator(opts?: { holdSeconds?: number; tolerance?: number }) {
  const hold = opts?.holdSeconds ?? 1.6;
  let tol = opts?.tolerance ?? 1;

  let baseX = 0.5;
  let baseY = 0.45;
  let scale = 0.18;
  let samples = 0;
  let timer = 0;
  let ready = false;
  let jumping = false;
  let ducking = false;
  let lane: 0 | 1 | 2 = 1;
  let velY = 0;
  let lastY = 0.45;

  const state: CalibState = {
    ready: false, progress: 0, steady: false, scale, dx: 0, dy: 0, baseY, baseX,
    jumping: false, ducking: false, lane: 1,
  };

  return {
    setTolerance(t: number) {
      tol = t;
    },
    reset() {
      baseX = 0.5; baseY = 0.45; scale = 0.18;
      samples = 0; timer = 0; ready = false;
      jumping = false; ducking = false; lane = 1; velY = 0;
    },
    /** يُستدعى كل إطار. يعيد الحالة الحالية للحركة. */
    update(lm: Landmarks | null, dt: number, calibrating: boolean, poseOk: boolean): CalibState {
      const nose = lm?.[L.nose];
      const ls = lm?.[L.lShoulder];
      const rs = lm?.[L.rShoulder];

      if (!poseOk || !nose || !ls || !rs) {
        if (calibrating) timer = Math.max(0, timer - dt * 1.5);
        state.steady = false;
        state.progress = Math.min(1, timer / hold);
        return state;
      }

      const nx = 1 - nose.x;
      const shoulders = Math.max(0.08, Math.abs(ls.x - rs.x));

      if (calibrating) {
        // متوسط متحرك: سريع في البداية ثم يهدأ لتثبيت القيمة
        const k = samples < 15 ? 0.4 : 0.07;
        baseX += (nx - baseX) * k;
        baseY += (nose.y - baseY) * k;
        scale += (shoulders - scale) * k;
        samples += 1;

        const steady =
          samples > 20 &&
          Math.abs(nx - baseX) < scale * 0.28 &&
          Math.abs(nose.y - baseY) < scale * 0.28 &&
          Math.abs(shoulders - scale) < scale * 0.22;

        timer = steady ? timer + dt : Math.max(0, timer - dt * 1.2);
        state.steady = steady;
        if (timer >= hold) ready = true;
      } else if (!ready) {
        // إعادة ضبط خفيفة أثناء اللعب لتعويض تحرك الطفل من مكانه
        baseX += (nx - baseX) * 0.01;
      } else {
        // انجراف بطيء جداً للأساس الأفقي فقط، يحافظ على دقة اللعب لفترة طويلة
        baseX += (nx - baseX) * 0.004;
        scale += (shoulders - scale) * 0.01;
      }

      const s = Math.max(0.08, scale);
      const dx = nx - baseX;
      const dy = nose.y - baseY;
      velY = velY * 0.7 + ((nose.y - lastY) / Math.max(dt, 0.001)) * 0.3;
      lastY = nose.y;

      // هستيريسيس: عتبة دخول أعلى من عتبة خروج
      const jumpIn = -s * 0.4 * tol;
      const jumpOut = -s * 0.16 * tol;
      const duckIn = s * 0.5 * tol;
      const duckOut = s * 0.2 * tol;
      jumping = jumping ? dy < jumpOut : dy < jumpIn || velY < -1.6 * s;
      ducking = ducking ? dy > duckOut : dy > duckIn;
      if (jumping) ducking = false;

      const gap = s * 0.8 * tol;
      const exit = gap * 0.6;
      if (lane === 1) lane = dx < -gap ? 0 : dx > gap ? 2 : 1;
      else if (lane === 0) lane = dx > -exit ? 1 : 0;
      else lane = dx < exit ? 1 : 2;

      state.baseY = baseY;
      state.baseX = baseX;
      state.ready = ready;
      state.progress = Math.min(1, timer / hold);
      state.scale = s;
      state.dx = dx;
      state.dy = dy;
      state.jumping = jumping;
      state.ducking = ducking;
      state.lane = lane;
      return state;
    },
  };
}
