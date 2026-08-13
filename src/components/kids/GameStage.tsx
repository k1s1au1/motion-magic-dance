import { type ReactNode, RefObject } from "react";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  title: string;
  emoji: string;
  hud?: ReactNode;
  banner?: ReactNode;
  onBack: () => void;
  children?: ReactNode;
  isCalibrating?: boolean;
  isPoseVisible?: boolean;
  /** 0..1 تقدم المعايرة */
  calibProgress?: number;
  /** الجسم ثابت داخل الإطار */
  isSteady?: boolean;
};

export default function GameStage({
  videoRef,
  canvasRef,
  title,
  emoji,
  hud,
  banner,
  onBack,
  children,
  isCalibrating,
  isPoseVisible,
  calibProgress = 0,
  isSteady,
}: Props) {
  const pct = Math.round(Math.min(1, Math.max(0, calibProgress)) * 100);

  return (
    <div className="kid-stage relative mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-hidden bg-[#05060f]">
      {/* خلفية اللعبة المتحركة */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_60%_at_50%_0%,rgba(80,120,255,0.22),transparent_70%),radial-gradient(80%_50%_at_50%_100%,rgba(255,80,190,0.16),transparent_70%)]" />

      <div className="relative flex-1">
        {/* الكاميرا مستشعر حركة فقط — لا تُعرض أثناء اللعب */}
        <video
          ref={videoRef}
          playsInline
          muted
          aria-hidden
          className={
            isCalibrating
              ? "absolute bottom-4 left-4 z-40 h-28 w-20 scale-x-[-1] rounded-2xl border border-white/25 object-cover opacity-80 shadow-2xl"
              : "pointer-events-none absolute h-px w-px opacity-0"
          }
        />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover" />

        {/* Cinematic Vignette */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,transparent_0%,rgba(5,5,16,0.4)_70%,rgba(5,5,16,0.85)_100%)]" />

        {/* Top Header */}
        <div className="relative z-20 flex items-start justify-between gap-2 p-5">
          <button
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white shadow-xl backdrop-blur-md transition-transform active:scale-90"
          >
            ←
          </button>
          <div className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-black text-white shadow-xl backdrop-blur-md">
            <span className="text-xl leading-none">{emoji}</span>
            <span>{title}</span>
          </div>
        </div>

        {hud && <div className="relative z-20 flex items-center justify-center gap-3 px-4">{hud}</div>}
        {banner}

        {/* شاشة المعايرة */}
        {isCalibrating && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/65 backdrop-blur-[3px]">
            <div
              className={`relative flex h-[400px] w-72 flex-col items-center justify-center rounded-[40px] border-4 border-dashed transition-colors duration-300 ${
                isSteady ? "border-emerald-400/70" : isPoseVisible ? "border-amber-300/60" : "border-cyan-400/40"
              }`}
            >
              <div className="absolute -inset-4 rounded-[50px] border-2 border-white/10" />
              <div className="scale-150 opacity-25">
                <span className="text-8xl">🕺</span>
              </div>
            </div>

            <div className="mt-8 w-full max-w-xs space-y-4 px-6 text-center">
              <div
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black transition-colors ${
                  isPoseVisible
                    ? isSteady
                      ? "bg-emerald-500 text-white"
                      : "bg-amber-400 text-black"
                    : "bg-white/20 text-white/60"
                }`}
              >
                {isPoseVisible ? (isSteady ? "ممتاز! لا تتحرك ✨" : "ثبّت جسمك قليلاً 🤏") : "قف داخل الإطار 👤"}
              </div>

              <h2 className="text-2xl font-black leading-tight text-white">
                {isPoseVisible ? "نقيس طولك ومركز جسمك..." : "ابتعد عن الكاميرا حتى يظهر جسمك بالكامل"}
              </h2>

              <div className="h-3 w-full overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-[width] duration-150"
                  style={{ width: `${pct}%` }}
                />
              </div>

              <p className="text-sm font-bold text-white/50">
                الكاميرا تقرأ حركتك فقط ولا تظهر في اللعب — شخصيتك داخل اللعبة هي التي تقلّدك
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="relative z-10 p-6 pb-10">{children}</div>
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
