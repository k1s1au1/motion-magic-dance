import { type ReactNode, RefObject, useState, useEffect } from "react";

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
}: Props) {
  return (
    <div className="kid-stage relative mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-hidden bg-[#050510]">
      <div className="relative flex-1">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full scale-x-[-1] object-cover opacity-60 transition-opacity duration-1000"
        />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover" />

        {/* Cinematic Vignette */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,transparent_0%,rgba(5,5,16,0.4)_70%,rgba(5,5,16,0.8)_100%)]" />

        {/* Top Header */}
        <div className="relative flex items-start justify-between gap-2 p-5 z-20">
          <button
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-xl active:scale-90 transition-transform"
          >
            ←
          </button>
          <div className="flex items-center gap-2 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 px-4 py-2 text-sm font-black text-white shadow-xl">
            <span className="text-xl leading-none">{emoji}</span>
            <span>{title}</span>
          </div>
        </div>

        {hud && <div className="relative flex items-center justify-center gap-3 px-4 z-20">{hud}</div>}
        {banner}

        {/* Calibration Overlay */}
        {isCalibrating && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[2px]">
            <div className="relative w-72 h-[400px] border-4 border-dashed border-cyan-400/50 rounded-[40px] flex flex-col items-center justify-center animate-pulse">
              <div className="absolute -inset-4 border-2 border-cyan-400/20 rounded-[50px]" />

              {/* Target Silhouette Hint */}
              <div className="opacity-30 scale-150">
                <span className="text-8xl">👤</span>
              </div>
            </div>

            <div className="mt-8 text-center px-10 space-y-4">
              <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black transition-colors ${isPoseVisible ? 'bg-green-500 text-white' : 'bg-white/20 text-white/60'}`}>
                {isPoseVisible ? 'تم رصد الجسم! ✨' : 'قف داخل الإطار 👤'}
              </div>

              <h2 className="text-2xl font-black text-white leading-tight">
                {isPoseVisible ? 'ثبّت مكانك للمعايرة...' : 'ابتعد عن الكاميرا حتى يظهر جسمك بالكامل'}
              </h2>

              <p className="text-sm text-white/50 font-bold">
                نضبط المسافة والمكان لضمان دقة اللعب
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
