import Link from "next/link";
import { Suspense } from "react";
import { Ball } from "@/components/ball";
import { SubmitStreak } from "@/components/submit-streak";
import { serviceClient } from "@/lib/supabase-server";

export const metadata = { title: "Leaderboard — Scouted" };

async function Board() {
  const db = serviceClient();
  const { data } = await db
    .from("leaderboard")
    .select("name,streak,created_at")
    .order("streak", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(20);
  const entries = data ?? [];

  return (
    <>
      {entries.length === 0 ? (
        <p className="mt-8 rounded-[28px] border-2 border-dashed border-edge bg-surface/50 p-8 text-center text-sm font-medium text-ink-soft">
          Nobody has posted a streak yet. Be first.
        </p>
      ) : (
        <ol className="mt-8 space-y-2">
          {entries.map((row, i) => (
            <li
              key={`${row.name}-${row.created_at}`}
              className="flex items-center gap-3 rounded-2xl border-2 border-edge bg-surface px-4 py-3"
            >
              <span className="w-6 text-right text-sm font-black tabular-nums text-ink-soft">
                {i + 1}
              </span>
              <span className="font-bold">{row.name}</span>
              <span className="ml-auto text-lg font-black tabular-nums">{row.streak}</span>
            </li>
          ))}
        </ol>
      )}

    </>
  );
}

export default function LeaderboardPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10 sm:py-14">
      <Link href="/" className="text-xs font-bold uppercase tracking-[0.18em] text-ink-soft">
        ← Back
      </Link>
      <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
        <span className="sr-only">Scouted leaderboard</span>
        <span aria-hidden>
          Sc<Ball />uted<span className="text-brand">.</span>
        </span>
      </h1>
      <p className="mt-1 text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
        Longest unlimited streaks
      </p>

      {/* The table is read live from the database, which a prerender cannot
          do, so it streams in behind this boundary. */}
      <Suspense
        fallback={
          <p className="mt-8 text-sm font-medium text-ink-soft">Loading the table…</p>
        }
      >
        <Board />
      </Suspense>

      <SubmitStreak />
    </main>
  );
}
