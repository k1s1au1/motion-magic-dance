import type { CalibrationState } from "@/motion/types";
import { TRACKED_PARTS } from "@/motion/landmarks";

type Props = {
  calibration: CalibrationState;
  status: string;
  error: string | null;
  countdown: number | null;
};

/** شاشة المعايرة: المعاينة الصغيرة الوحيدة للكاميرا في التطبيق */
export function CalibrationOverlay({ calibration, status, error, countdown }: Props) {
  const parts = TRACKED_PARTS.map((p) => ({
    label: p.label,
    ok: (calibration as unknown as Record<string, boolean>)[p.key] ?? false,
  }));

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-[oklch(0.08_0.03_280/0.88)] px-6 text-center backdrop-blur-md">
      {countdown !== null ? (
        <div className="text-[9rem] font-black leading-none title-glow">
          {countdown === 0 ? "انطلق!" : countdown}
        </div>
      ) : (
        <>
          <h2 className="text-2xl font-black text-foreground">اضبط وقفتك</h2>
          <p className="max-w-xs text-sm text-muted-foreground">
            ابتعد عن الجهاز حتى يظهر جسمك كامل داخل الإطار، وقف ثابتاً لحظتين.
          </p>

          <div className="flex flex-wrap justify-center gap-2">
            {parts.map((p) => (
              <span
                key={p.label}
                className={`rounded-full border px-3 py-1 text-xs font-bold ${
                  p.ok
                    ? "border-transparent bg-[color:var(--neon-lime)] text-black"
                    : "border-[oklch(1_0_0/0.18)] text-muted-foreground"
                }`}
              >
                {p.ok ? "✓ " : "• "}
                {p.label}
              </span>
            ))}
          </div>

          <div className="h-3 w-64 overflow-hidden rounded-full bg-[oklch(1_0_0/0.12)]">
            <div
              className="match-bar h-full rounded-full"
              style={{ width: `${Math.round(calibration.progress * 100)}%` }}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            {error
              ? error
              : status === "loading"
                ? "جاري تجهيز مستشعر الحركة…"
                : calibration.bodyInFrame
                  ? calibration.steady
                    ? "ممتاز… ثبات!"
                    : "قرّب/ابعد قليلاً وثبّت"
                  : "خلّ جسمك كامل داخل الكادر"}
          </p>
        </>
      )}
    </div>
  );
}
