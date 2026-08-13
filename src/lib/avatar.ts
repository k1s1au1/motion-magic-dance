import { L, type Landmarks, type Pt } from "@/lib/dance";
import { glow, groundShadow, withAlpha } from "@/lib/gfx";

/**
 * شخصية اللعبة (Avatar): تُرسم من بيانات تتبّع الجسم بدل عرض صورة اللاعب.
 * الرسم يتم داخل نظام إحداثيات اللعبة (مطابق لما يراه الطفل)، بلا أي بث كاميرا.
 */

export type AvatarStyle = {
  /** لون البدلة */
  suit: string;
  /** لون الإضاءة/التوهج */
  accent: string;
  /** لون البشرة */
  skin: string;
};

export const AVATAR_STYLES: Record<string, AvatarStyle> = {
  hero: { suit: "#2b6cff", accent: "#61e8ff", skin: "#ffd7a8" },
  ninja: { suit: "#16324a", accent: "#7cf76b", skin: "#ffd7a8" },
  keeper: { suit: "#0f766e", accent: "#5eead4", skin: "#ffd7a8" },
  neon: { suit: "#7c1fd1", accent: "#ff5bd1", skin: "#ffd7a8" },
  star: { suit: "#b45309", accent: "#fcd34d", skin: "#ffd7a8" },
};

type XY = { x: number; y: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function mid(a: XY, b: XY): XY {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** يحوّل نقطة من فضاء الكاميرا إلى فضاء اللعبة (نفس ما يراه اللاعب) */
function toGame(p: Pt | undefined, w: number, h: number): XY | null {
  if (!p) return null;
  return { x: (1 - p.x) * w, y: p.y * h };
}

function limb(
  ctx: CanvasRenderingContext2D,
  a: XY,
  b: XY,
  width: number,
  color: string,
  accent: string,
) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = withAlpha(accent, 0.28);
  ctx.lineWidth = width * 1.7;
  stroke(ctx, a, b);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  stroke(ctx, a, b);
  // لمعة إضاءة علوية على الطرف
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = width * 0.3;
  stroke(ctx, { x: a.x - width * 0.18, y: a.y }, { x: b.x - width * 0.18, y: b.y });
  ctx.restore();
}

function stroke(ctx: CanvasRenderingContext2D, a: XY, b: XY) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function hand(ctx: CanvasRenderingContext2D, p: XY, r: number, style: AvatarStyle, energy: number) {
  if (energy > 0.15) glow(ctx, p.x, p.y, r * (2.2 + energy * 3), style.accent, 0.35 + energy * 0.4);
  ctx.save();
  ctx.fillStyle = style.skin;
  ctx.shadowColor = style.accent;
  ctx.shadowBlur = r * (1 + energy * 4);
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export type AvatarOptions = {
  style?: AvatarStyle;
  /** 0..1 قوة الحركة الحالية (لتوهّج اليدين والأثر) */
  energy?: number;
  /** ظل أرضي أسفل الشخصية */
  shadow?: boolean;
  /** شفافية عامة */
  alpha?: number;
  /** إسقاط الشخصية داخل مساحة محددة داخل مشهد اللعبة */
  fit?: { cx: number; bottom: number; height: number };
};

/**
 * يرسم شخصية اللعبة معتمداً على مفاصل الجسم المتتبَّعة.
 * الحركة طبيعية: جذع متصل، رأس بميلان الكتفين، أطراف بسماكات متدرجة.
 */
export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  lm: Landmarks | null,
  w: number,
  h: number,
  opts: AvatarOptions = {},
) {
  if (!lm) return;
  const style = opts.style ?? AVATAR_STYLES["hero"]!;
  const energy = Math.max(0, Math.min(1, opts.energy ?? 0));

  const ls = toGame(lm[L.lShoulder], w, h);
  const rs = toGame(lm[L.rShoulder], w, h);
  const lh = toGame(lm[L.lHip], w, h);
  const rh = toGame(lm[L.rHip], w, h);
  const nose = toGame(lm[L.nose], w, h);
  if (!ls || !rs || !lh || !rh || !nose) return;

  const shoulderW = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  const unit = Math.max(shoulderW, w * 0.12);
  const neck = mid(ls, rs);
  const pelvis = mid(lh, rh);

  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;

  // إسقاط (Retargeting) الشخصية داخل مساحة اللعبة المطلوبة
  if (opts.fit) {
    const pts = [L.nose, L.lShoulder, L.rShoulder, L.lHip, L.rHip, L.lAnkle, L.rAnkle]
      .map((i) => toGame(lm[i], w, h))
      .filter(Boolean) as XY[];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const q of pts) {
      minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x);
      minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
    }
    const bh = Math.max(1, maxY - minY);
    const k = opts.fit.height / bh;
    ctx.translate(opts.fit.cx, opts.fit.bottom);
    ctx.scale(k, k);
    ctx.translate(-(minX + maxX) / 2, -maxY);
  }

  // ظل أرضي
  if (opts.shadow !== false) {
    const la = toGame(lm[L.lAnkle], w, h);
    const ra = toGame(lm[L.rAnkle], w, h);
    const feet = la && ra ? mid(la, ra) : { x: pelvis.x, y: pelvis.y + unit * 1.6 };
    groundShadow(ctx, feet.x, feet.y + unit * 0.08, unit * 0.85, 0.38);
  }

  // هالة الشخصية
  glow(ctx, neck.x, lerp(neck.y, pelvis.y, 0.4), unit * 1.9, style.accent, 0.16 + energy * 0.12);

  // الأرجل
  const legs: [number, number, number][] = [
    [L.lHip, L.lKnee, L.lAnkle],
    [L.rHip, L.rKnee, L.rAnkle],
  ];
  for (const [hip, knee, ankle] of legs) {
    const a = toGame(lm[hip], w, h);
    const b = toGame(lm[knee], w, h);
    const c = toGame(lm[ankle], w, h);
    if (a && b) limb(ctx, a, b, unit * 0.3, style.suit, style.accent);
    if (b && c) limb(ctx, b, c, unit * 0.24, style.suit, style.accent);
    if (c) {
      ctx.save();
      ctx.fillStyle = "#101827";
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + unit * 0.04, unit * 0.19, unit * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // الجذع كشكل متصل
  ctx.save();
  const torso = ctx.createLinearGradient(neck.x, neck.y, pelvis.x, pelvis.y);
  torso.addColorStop(0, style.suit);
  torso.addColorStop(1, withAlpha(style.accent, 0.85));
  ctx.fillStyle = torso;
  ctx.shadowColor = style.accent;
  ctx.shadowBlur = unit * 0.5;
  ctx.beginPath();
  ctx.moveTo(ls.x, ls.y);
  ctx.quadraticCurveTo(lerp(ls.x, lh.x, 0.5) + unit * 0.06, lerp(ls.y, lh.y, 0.5), lh.x, lh.y);
  ctx.lineTo(rh.x, rh.y);
  ctx.quadraticCurveTo(lerp(rs.x, rh.x, 0.5) - unit * 0.06, lerp(rs.y, rh.y, 0.5), rs.x, rs.y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // خط إضاءة على الصدر
  ctx.save();
  ctx.strokeStyle = withAlpha(style.accent, 0.9);
  ctx.lineWidth = unit * 0.06;
  ctx.beginPath();
  ctx.moveTo(neck.x, neck.y + unit * 0.15);
  ctx.lineTo(pelvis.x, pelvis.y - unit * 0.2);
  ctx.stroke();
  ctx.restore();

  // الذراعان
  const arms: [number, number, number][] = [
    [L.lShoulder, L.lElbow, L.lWrist],
    [L.rShoulder, L.rElbow, L.rWrist],
  ];
  for (const [sh, el, wr] of arms) {
    const a = toGame(lm[sh], w, h);
    const b = toGame(lm[el], w, h);
    const c = toGame(lm[wr], w, h);
    if (a && b) limb(ctx, a, b, unit * 0.24, style.suit, style.accent);
    if (b && c) limb(ctx, b, c, unit * 0.2, style.skin, style.accent);
    if (c) hand(ctx, c, unit * 0.14, style, energy);
  }

  // الرأس بميلان الكتفين
  const headR = unit * 0.42;
  const angle = Math.atan2(ls.y - rs.y, ls.x - rs.x);
  const headC = { x: nose.x, y: nose.y + headR * 0.12 };
  ctx.save();
  ctx.translate(headC.x, headC.y);
  ctx.rotate(angle);
  const hg = ctx.createRadialGradient(-headR * 0.3, -headR * 0.35, headR * 0.1, 0, 0, headR);
  hg.addColorStop(0, "#fff1dc");
  hg.addColorStop(1, style.skin);
  ctx.shadowColor = style.accent;
  ctx.shadowBlur = headR * 0.9;
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.ellipse(0, 0, headR * 0.86, headR, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // خوذة/شعر
  ctx.fillStyle = style.suit;
  ctx.beginPath();
  ctx.ellipse(0, -headR * 0.32, headR * 0.9, headR * 0.62, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = withAlpha(style.accent, 0.95);
  ctx.beginPath();
  ctx.ellipse(0, -headR * 0.06, headR * 0.9, headR * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();

  // عيون مبتسمة
  ctx.fillStyle = "#111827";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * headR * 0.32, headR * 0.22, headR * 0.1, headR * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = headR * 0.09;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, headR * 0.4, headR * 0.22, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

/** يحسب "طاقة" الحركة من سرعة اليدين (0..1) لاستخدامها في المؤثرات */
export function makeEnergyMeter() {
  let prevL: XY | null = null;
  let prevR: XY | null = null;
  let value = 0;
  return (lm: Landmarks | null, dt: number) => {
    const l = lm?.[L.lWrist];
    const r = lm?.[L.rWrist];
    let raw = 0;
    if (l && prevL) raw += Math.hypot(l.x - prevL.x, l.y - prevL.y);
    if (r && prevR) raw += Math.hypot(r.x - prevR.x, r.y - prevR.y);
    prevL = l ? { x: l.x, y: l.y } : null;
    prevR = r ? { x: r.x, y: r.y } : null;
    const speed = raw / Math.max(dt, 0.016);
    value = value * 0.82 + Math.min(1, speed / 2.2) * 0.18;
    return value;
  };
}
