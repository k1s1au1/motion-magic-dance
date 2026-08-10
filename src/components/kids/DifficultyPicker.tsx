import { DIFFICULTIES, type DifficultyId } from "@/lib/difficulty";

type Props = {
  value: DifficultyId;
  onChange: (id: DifficultyId) => void;
  disabled?: boolean;
};

/** مبدّل مستوى الصعوبة الظاهر في شاشة بداية كل لعبة */
export default function DifficultyPicker({ value, onChange, disabled }: Props) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-black text-white/50">مستوى الصعوبة</p>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="مستوى الصعوبة">
        {DIFFICULTIES.map((d) => {
          const active = d.id === value;
          return (
            <button
              key={d.id}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(d.id)}
              className={`rounded-2xl border px-2 py-3 text-sm font-black transition-all active:scale-95 ${
                active
                  ? "border-white/60 bg-white/25 text-white shadow-lg shadow-black/40 scale-[1.03]"
                  : "border-white/15 bg-white/5 text-white/60"
              }`}
            >
              <span className="block text-xl leading-none">{d.emoji}</span>
              <span className="mt-1 block">{d.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
