type Props = {
  title: string;
  points: number;
  combo: number;
  timeLeft: number;
  duration: number;
  tracked: boolean;
  onExit: () => void;
};

export function Hud({ title, points, combo, timeLeft, duration, tracked, onExit }: Props) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3">
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={onExit}
          className="pointer-events-auto rounded-full border border-[oklch(1_0_0/0.18)] bg-[oklch(0.14_0.05_300/0.6)] px-4 py-2 text-sm font-bold text-foreground backdrop-blur"
        >
          خروج
        </button>
        <div className="flex gap-2">
          <div className="hud-card items-center">
            <span className="hud-label">النقاط</span>
            <span className="hud-value">{points}</span>
          </div>
          <div className="hud-card items-center">
            <span className="hud-label">سلسلة</span>
            <span className="hud-value">{combo}x</span>
          </div>
          <div className="hud-card items-center">
            <span className="hud-label">الوقت</span>
            <span className="hud-value">{Math.ceil(timeLeft)}</span>
          </div>
        </div>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[oklch(1_0_0/0.12)]">
        <div className="beat-bar h-full" style={{ width: `${(timeLeft / duration) * 100}%` }} />
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{title}</span>
        <span className={tracked ? "text-[color:var(--neon-lime)]" : "text-[color:var(--neon-pink)]"}>
          {tracked ? "● المستشعر يتابعك" : "○ ما ألقاك… ارجع للكادر"}
        </span>
      </div>
    </div>
  );
}
