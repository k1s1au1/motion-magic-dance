type Props = {
  title: string;
  points: number;
  best: number;
  accuracy: number;
  bestCombo: number;
  stars: number;
  onReplay: () => void;
  onExit: () => void;
};

export function ResultCard({ title, points, best, accuracy, bestCombo, stars, onReplay, onExit }: Props) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[oklch(0.07_0.03_280/0.9)] px-6 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-3xl border border-[oklch(1_0_0/0.14)] bg-[oklch(0.16_0.05_300/0.8)] p-6 text-center">
        <p className="text-sm text-muted-foreground">{title}</p>
        <h2 className="mt-1 text-5xl font-black title-glow">{points}</h2>
        <div className="mt-2 text-2xl">
          {"★".repeat(stars)}
          <span className="opacity-25">{"★".repeat(3 - stars)}</span>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 text-sm">
          <div className="hud-card items-center">
            <span className="hud-label">الدقة</span>
            <span className="hud-value">{accuracy}%</span>
          </div>
          <div className="hud-card items-center">
            <span className="hud-label">أطول سلسلة</span>
            <span className="hud-value">{bestCombo}</span>
          </div>
          <div className="hud-card items-center">
            <span className="hud-label">أفضل نتيجة</span>
            <span className="hud-value">{best}</span>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <button onClick={onReplay} className="btn-neon">
            العب مرة ثانية
          </button>
          <button
            onClick={onExit}
            className="rounded-full border border-[oklch(1_0_0/0.18)] px-5 py-3 font-bold text-foreground"
          >
            رجوع للألعاب
          </button>
        </div>
      </div>
    </div>
  );
}
