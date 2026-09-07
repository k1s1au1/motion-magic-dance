import type { MotionEvent, MotionInput } from "@/motion/types";
import type { Vfx } from "./vfx";
import type { Score } from "./score";

export type Difficulty = "slow" | "normal" | "fast";

export const DIFFICULTY: Record<Difficulty, { label: string; speed: number; rate: number; window: number }> = {
  slow: { label: "بطيء", speed: 0.72, rate: 0.7, window: 1.4 },
  normal: { label: "متوسط", speed: 1, rate: 1, window: 1 },
  fast: { label: "سريع", speed: 1.35, rate: 1.4, window: 0.75 },
};

export type Frame = {
  ctx: CanvasRenderingContext2D;
  /** أبعاد منطقية (CSS px) */
  w: number;
  h: number;
  dt: number;
  /** الزمن منذ بداية الجولة بالثواني */
  t: number;
  input: MotionInput;
  events: MotionEvent[];
  vfx: Vfx;
  score: Score;
  diff: (typeof DIFFICULTY)[Difficulty];
};

export type GameInstance = {
  /** تحديث + رسم في خطوة واحدة */
  step(f: Frame): void;
};

export type GameDef = {
  id: string;
  title: string;
  tagline: string;
  howto: string;
  duration: number;
  accent: string;
  accent2: string;
  emoji: string;
  create(): GameInstance;
};
