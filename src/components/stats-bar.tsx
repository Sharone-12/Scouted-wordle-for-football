import { Flame, Trophy } from "lucide-react";
import type { Mode } from "@/lib/game";
import { winRate, type ModeStats } from "@/lib/stats";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border-2 border-ink/10 bg-white px-3 py-2">
      <span className="text-lg font-black tabular-nums leading-none">{value}</span>
      <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-soft">
        {label}
      </span>
    </div>
  );
}

export function StatsBar({ stats, mode }: { stats: ModeStats; mode: Mode }) {
  if (!stats.played) return null;

  return (
    <section
      aria-label={`${mode} record`}
      className="mt-6 grid grid-cols-4 gap-2 sm:max-w-md"
    >
      <Stat label={mode === "daily" ? "Days" : "Rounds"} value={stats.played} />
      <Stat label="Win %" value={`${winRate(stats)}%`} />
      <Stat label="Streak" value={stats.current} />
      <Stat label="Best" value={stats.best} />
    </section>
  );
}

/** The streak chip that sits beside the guess counter while playing. */
export function StreakChip({ stats }: { stats: ModeStats }) {
  if (stats.current < 2) return null;
  const onBest = stats.current >= stats.best && stats.best > 0;
  return (
    <span
      className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-white
                  ${onBest ? "bg-brand" : "bg-ink/70"}`}
      title={onBest ? "Your best run yet" : `Best: ${stats.best}`}
    >
      {onBest ? (
        <Trophy aria-hidden className="size-3.5" strokeWidth={2.5} />
      ) : (
        <Flame aria-hidden className="size-3.5" strokeWidth={2.5} />
      )}
      {stats.current} in a row
    </span>
  );
}
