export type Pt = { x: number; y: number; visibility?: number };
export type Landmarks = Pt[];

export const L = {
  nose: 0,
  lShoulder: 11,
  rShoulder: 12,
  lElbow: 13,
  rElbow: 14,
  lWrist: 15,
  rWrist: 16,
  lHip: 23,
  rHip: 24,
  lKnee: 25,
  rKnee: 26,
  lAnkle: 27,
  rAnkle: 28,
};

export const POSE_CONNECTIONS: [number, number][] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
];

export type Move = {
  id: string;
  name: string;
  emoji: string;
  /** returns 0..1 how well the pose matches */
  match: (lm: Landmarks) => number;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** score 1 when value >= good, 0 when value <= bad */
const ramp = (v: number, bad: number, good: number) => clamp01((v - bad) / (good - bad));

function shoulderWidth(lm: Landmarks) {
  return Math.max(0.08, Math.abs(lm[L.lShoulder].x - lm[L.rShoulder].x));
}

export const MOVES: Move[] = [
  {
    id: "both-up",
    name: "ارفع يديك فوق راسك",
    emoji: "🙌",
    match: (lm) => {
      const w = shoulderWidth(lm);
      const a = ramp((lm[L.lShoulder].y - lm[L.lWrist].y) / w, 0, 0.9);
      const b = ramp((lm[L.rShoulder].y - lm[L.rWrist].y) / w, 0, 0.9);
      return (a + b) / 2;
    },
  },
  {
    id: "right-up",
    name: "ارفع يدك اليمنى فقط",
    emoji: "🤚",
    match: (lm) => {
      const w = shoulderWidth(lm);
      const up = ramp((lm[L.rShoulder].y - lm[L.rWrist].y) / w, 0, 0.8);
      const down = ramp((lm[L.lWrist].y - lm[L.lShoulder].y) / w, -0.1, 0.4);
      return up * 0.7 + down * 0.3;
    },
  },
  {
    id: "left-up",
    name: "ارفع يدك اليسرى فقط",
    emoji: "✋",
    match: (lm) => {
      const w = shoulderWidth(lm);
      const up = ramp((lm[L.lShoulder].y - lm[L.lWrist].y) / w, 0, 0.8);
      const down = ramp((lm[L.rWrist].y - lm[L.rShoulder].y) / w, -0.1, 0.4);
      return up * 0.7 + down * 0.3;
    },
  },
  {
    id: "t-pose",
    name: "افرد ذراعيك على الجانبين",
    emoji: "🕺",
    match: (lm) => {
      const w = shoulderWidth(lm);
      const spread =
        (Math.abs(lm[L.lWrist].x - lm[L.rWrist].x) / w) > 0 ? Math.abs(lm[L.lWrist].x - lm[L.rWrist].x) / w : 0;
      const wide = ramp(spread, 1.4, 2.4);
      const level =
        1 -
        clamp01(
          (Math.abs(lm[L.lWrist].y - lm[L.lShoulder].y) + Math.abs(lm[L.rWrist].y - lm[L.rShoulder].y)) /
            (2 * w * 0.6),
        );
      return wide * 0.6 + level * 0.4;
    },
  },
  {
    id: "clap",
    name: "اجمع يديك أمام صدرك",
    emoji: "👏",
    match: (lm) => {
      const w = shoulderWidth(lm);
      const d = Math.hypot(lm[L.lWrist].x - lm[L.rWrist].x, lm[L.lWrist].y - lm[L.rWrist].y) / w;
      const close = 1 - clamp01((d - 0.15) / 0.6);
      const chest =
        1 - clamp01(Math.abs((lm[L.lWrist].y + lm[L.rWrist].y) / 2 - (lm[L.lShoulder].y + lm[L.rShoulder].y) / 2) / (w * 0.9));
      return close * 0.7 + chest * 0.3;
    },
  },
  {
    id: "lean-right",
    name: "مِل بجسمك لليمين",
    emoji: "↗️",
    match: (lm) => {
      const w = shoulderWidth(lm);
      const sc = (lm[L.lShoulder].x + lm[L.rShoulder].x) / 2;
      const hc = (lm[L.lHip].x + lm[L.rHip].x) / 2;
      return ramp((hc - sc) / w, 0.05, 0.45);
    },
  },
  {
    id: "lean-left",
    name: "مِل بجسمك لليسار",
    emoji: "↖️",
    match: (lm) => {
      const w = shoulderWidth(lm);
      const sc = (lm[L.lShoulder].x + lm[L.rShoulder].x) / 2;
      const hc = (lm[L.lHip].x + lm[L.rHip].x) / 2;
      return ramp((sc - hc) / w, 0.05, 0.45);
    },
  },
  {
    id: "squat",
    name: "انزل قرفصاء",
    emoji: "🏋️",
    match: (lm) => {
      const w = shoulderWidth(lm);
      const hipY = (lm[L.lHip].y + lm[L.rHip].y) / 2;
      const kneeY = (lm[L.lKnee].y + lm[L.rKnee].y) / 2;
      return ramp(1 - (kneeY - hipY) / (w * 1.6), 0.15, 0.75);
    },
  },
];

export function poseVisible(lm: Landmarks | undefined): lm is Landmarks {
  if (!lm || lm.length < 29) return false;
  const key = [L.lShoulder, L.rShoulder, L.lHip, L.rHip];
  return key.every((i) => (lm[i]?.visibility ?? 1) > 0.4);
}

export function makeRoutine(length = 12): Move[] {
  const out: Move[] = [];
  let last = -1;
  for (let i = 0; i < length; i++) {
    let n = Math.floor(Math.random() * MOVES.length);
    if (n === last) n = (n + 1) % MOVES.length;
    last = n;
    out.push(MOVES[n]);
  }
  return out;
}

export function rating(score: number) {
  if (score >= 0.85) return { label: "مثالي!", cls: "text-[var(--neon-lime)]", points: 1000 };
  if (score >= 0.65) return { label: "ممتاز", cls: "text-[var(--neon-cyan)]", points: 600 };
  if (score >= 0.4) return { label: "جيد", cls: "text-[var(--neon-amber)]", points: 300 };
  return { label: "أخطأت", cls: "text-[var(--neon-pink)]", points: 0 };
}
