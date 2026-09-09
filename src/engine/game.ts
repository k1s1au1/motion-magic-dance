import type { ComponentType } from "react";
import type { MotionEvent, MotionInput } from "@/motion/types";
import type { Fx3D } from "./fx3d";
import type { Score } from "./score";

export type Difficulty = "slow" | "normal" | "fast";

export const DIFFICULTY: Record<Difficulty, { label: string; speed: number; rate: number; window: number }> = {
  slow: { label: "بطيء", speed: 0.72, rate: 0.7, window: 1.4 },
  normal: { label: "متوسط", speed: 1, rate: 1, window: 1 },
  fast: { label: "سريع", speed: 1.35, rate: 1.4, window: 0.75 },
};

/** إطار اللعب ثلاثي الأبعاد: يمرَّر لكل لعبة في كل frame */
export type Frame3D = {
  dt: number;
  t: number;
  input: MotionInput;
  events: MotionEvent[];
  fx: Fx3D;
  score: Score;
  diff: (typeof DIFFICULTY)[Difficulty];
};

/** حدود عالم اللعب بالوحدات العالمية (World units) */
export const WORLD = { w: 9, h: 6 };

/** تحويل فضاء اللاعب 0..1 إلى إحداثيات العالم (بدون أي انعكاس) */
export function toWorldX(x: number) {
  return (x - 0.5) * WORLD.w;
}
export function toWorldY(y: number) {
  return (0.5 - y) * WORLD.h;
}

export type GameSceneProps = { frame: () => Frame3D };

export type GameDef = {
  id: string;
  title: string;
  tagline: string;
  howto: string;
  duration: number;
  accent: string;
  accent2: string;
  emoji: string;
  /** لون خلفية المشهد ثلاثي الأبعاد */
  bg: string;
  fogNear?: number;
  fogFar?: number;
  camera?: [number, number, number];
  Scene: ComponentType<GameSceneProps>;
};
