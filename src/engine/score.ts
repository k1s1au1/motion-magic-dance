/** نظام النقاط والسلسلة المشترك بين كل الألعاب */
export type Grade = "perfect" | "good" | "miss";

export class Score {
  points = 0;
  combo = 0;
  bestCombo = 0;
  hits = 0;
  misses = 0;
  timeLeft: number;
  readonly duration: number;
  lastGrade: Grade | null = null;

  constructor(duration: number) {
    this.duration = duration;
    this.timeLeft = duration;
  }

  tick(dt: number) {
    this.timeLeft = Math.max(0, this.timeLeft - dt);
  }

  get finished() {
    return this.timeLeft <= 0;
  }

  hit(base = 100, grade: Grade = "good") {
    this.combo++;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    this.hits++;
    this.lastGrade = grade;
    const mult = 1 + Math.min(2, this.combo * 0.08);
    this.points += Math.round(base * mult * (grade === "perfect" ? 1.5 : 1));
    return this.points;
  }

  miss() {
    this.combo = 0;
    this.misses++;
    this.lastGrade = "miss";
  }

  get accuracy() {
    const total = this.hits + this.misses;
    return total ? Math.round((this.hits / total) * 100) : 0;
  }

  get stars() {
    const a = this.accuracy;
    return a >= 85 ? 3 : a >= 60 ? 2 : a >= 30 ? 1 : 0;
  }
}

const KEY = "motion-arcade-best";

export function readBest(gameId: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const all = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Record<string, number>;
    return all[gameId] ?? 0;
  } catch {
    return 0;
  }
}

export function writeBest(gameId: string, points: number) {
  if (typeof window === "undefined") return readBest(gameId);
  try {
    const all = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Record<string, number>;
    const best = Math.max(all[gameId] ?? 0, points);
    all[gameId] = best;
    window.localStorage.setItem(KEY, JSON.stringify(all));
    return best;
  } catch {
    return points;
  }
}
