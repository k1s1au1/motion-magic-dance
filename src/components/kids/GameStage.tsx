import type { ReactNode, RefObject } from "react";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  title: string;
  emoji: string;
  hud?: ReactNode;
  banner?: ReactNode;
  onBack: () => void;
  children?: ReactNode;
};

export default function GameStage({ videoRef, canvasRef, title, emoji, hud, banner, onBack, children }: Props) {
  return (
    <div className="kid-stage relative mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-hidden">
      <div className="relative flex-1">
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full scale-x-[-1] object-cover opacity-70" />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,transparent,var(--color-background))]" />

        <div className="relative flex items-start justify-between gap-2 p-4">
          <button onClick={onBack} className="kid-pill text-sm font-bold">
            ← رجوع
          </button>
          <div className="kid-pill text-sm font-extrabold">
            {emoji} {title}
          </div>
        </div>

        {hud && <div className="relative flex items-center justify-center gap-3 px-4">{hud}</div>}
        {banner}
      </div>

      <div className="relative z-10 p-5 pb-8">{children}</div>
    </div>
  );
}

export function KidHud({ label, value }: { label: string; value: string }) {
  return (
    <div className="kid-hud">
      <span className="kid-hud-label">{label}</span>
      <span className="kid-hud-value">{value}</span>
    </div>
  );
}
