import { useCallback, useEffect, useState } from "react";

export type DifficultyId = "slow" | "normal" | "fast";

export type Difficulty = {
  id: DifficultyId;
  name: string;
  emoji: string;
  /** يضرب في سرعة الأعداء/الليزر/الكرات */
  speed: number;
  /** يضرب في الفاصل الزمني بين الظهور (أكبر = أهدأ) */
  spawn: number;
  /** تسامح المعايرة ومساحة اللمس (أكبر = أسهل) */
  tolerance: number;
  bpm: number;
};

export const DIFFICULTIES: Difficulty[] = [
  { id: "slow", name: "بطيء", emoji: "🐢", speed: 0.65, spawn: 1.45, tolerance: 1.4, bpm: 116 },
  { id: "normal", name: "متوسط", emoji: "🐇", speed: 1, spawn: 1, tolerance: 1, bpm: 138 },
  { id: "fast", name: "سريع", emoji: "🚀", speed: 1.5, spawn: 0.68, tolerance: 0.82, bpm: 158 },
];

const KEY = "kids-difficulty";

export function getDifficulty(id: DifficultyId): Difficulty {
  return DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[1]!;
}

function read(): DifficultyId {
  if (typeof window === "undefined") return "normal";
  const v = window.localStorage.getItem(KEY);
  return v === "slow" || v === "fast" || v === "normal" ? v : "normal";
}

/** مستوى الصعوبة المشترك بين كل الألعاب (محفوظ على الجهاز) */
export function useDifficulty() {
  const [id, setId] = useState<DifficultyId>("normal");

  useEffect(() => setId(read()), []);

  const select = useCallback((next: DifficultyId) => {
    setId(next);
    if (typeof window !== "undefined") window.localStorage.setItem(KEY, next);
  }, []);

  return { diff: getDifficulty(id), id, select };
}
