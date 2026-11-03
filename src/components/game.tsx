"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Flag,
  Flame,
  Infinity as InfinityIcon,
  RotateCw,
  Trophy,
  Users,
} from "lucide-react";
import { Ball } from "@/components/ball";
import { GuessInput } from "@/components/guess-input";
import { Loading } from "@/components/loading";
import { GuessRow } from "@/components/guess-row";
import { SaveStreakDialog } from "@/components/save-streak-dialog";
import { HowToPlay } from "@/components/how-to-play";
import { MAX_GUESSES, type Cell, type GuessOption, type Mode } from "@/lib/game";
import { SILVER } from "@/lib/utils";
import { playerId } from "@/lib/identity";
import {
  EMPTY,
  loadBoard,
  loadStats,
  saveBoard,
  saveStats,
  type Stats,
} from "@/lib/stats";

const MODES: { id: Mode; label: string; icon: typeof CalendarDays }[] = [
  { id: "daily", label: "Daily", icon: CalendarDays },
  { id: "unlimited", label: "Unlimited", icon: InfinityIcon },
];

export function Game({
  players,
  puzzleNumber,
  puzzleDate,
}: {
  players: GuessOption[];
  puzzleNumber: number;
  puzzleDate: string;
}) {
  const [mode, setMode] = useState<Mode>("daily");
  // Each mode keeps its own board, so switching to practise a few and coming
  // back does not throw away the day's progress.
  const [boards, setBoards] = useState<Record<Mode, GuessOption[]>>({ daily: [], unlimited: [] });
  const [surrendered, setSurrendered] = useState<Record<Mode, boolean>>({
    daily: false,
    unlimited: false,
  });
  const [confirmingGiveUp, setConfirmingGiveUp] = useState(false);
  const [round, setRound] = useState(1);
  const [stats, setStats] = useState<Stats>(EMPTY);

  // localStorage is read after mount, never during render: the server has no
  // access to it, and seeding state from it directly makes the first client
  // render disagree with the HTML it is hydrating.
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [lostStreak, setLostStreak] = useState<number | null>(null);
  const [savePrompt, setSavePrompt] = useState<number | null>(null);

  // Both modes are judged on the server: it holds the answer, says how each
  // guess compares and — in unlimited — counts the streak, so the board is a
  // record of play rather than something this browser worked out for itself.
  // The answer's name arrives only once the round can no longer be played.
  const [runId, setRunId] = useState<string | null>(null);
  const [cells, setCells] = useState<Record<Mode, Record<number, Cell[]>>>({
    daily: {},
    unlimited: {},
  });
  const [solvedId, setSolvedId] = useState<Record<Mode, number | null>>({
    daily: null,
    unlimited: null,
  });
  const [reveal, setReveal] = useState<Record<Mode, string | null>>({
    daily: null,
    unlimited: null,
  });
  const [runEnded, setRunEnded] = useState(false);
  const [runBusy, setRunBusy] = useState(false);

  const resetRound = useCallback(() => {
    setCells((c) => ({ ...c, unlimited: {} }));
    setSolvedId((sv) => ({ ...sv, unlimited: null }));
    setReveal((r) => ({ ...r, unlimited: null }));
    setBoards((b) => ({ ...b, unlimited: [] }));
  }, []);

  /**
   * The day's board, judged by the server.
   *
   * Every guess so far goes up, not just the newest one: the reply then holds
   * a verdict for each row, which is what rebuilds the board after a reload
   * without the browser ever being told the answer. Replaying the same list
   * cannot change the outcome, so this is safe to call on mount.
   */
  const judgeDaily = useCallback(async (ids: number[], gaveUp = false) => {
    const res = await fetch("/api/daily", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ guessIds: ids, gaveUp }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      cells: Record<number, Cell[]>;
      solvedId: number | null;
      over: boolean;
      answer: string | null;
    };
    setCells((c) => ({ ...c, daily: body.cells }));
    setSolvedId((sv) => ({ ...sv, daily: body.solvedId }));
    setReveal((r) => ({ ...r, daily: body.answer }));
    return body;
  }, []);

  useEffect(() => {
    setStats(loadStats());
    const saved = loadBoard(puzzleNumber)
      .map((id) => byId.get(id))
      .filter((p): p is GuessOption => !!p);
    if (saved.length) {
      setBoards((b) => ({ ...b, daily: saved }));
      void judgeDaily(saved.map((p) => p.id));
    }
  }, [puzzleNumber, byId, judgeDaily]);

  const startRun = useCallback(async () => {
    setRunBusy(true);
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: playerId() }),
    });
    setRunBusy(false);
    if (!res.ok) return;
    const body = await res.json();
    setRunId(body.runId);
    setRunEnded(false);
    setStreak(0);
    resetRound();
  }, [resetRound]);

  const runAction = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      if (!runId) return null;
      const res = await fetch(`/api/runs/${runId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, playerId: playerId(), ...extra }),
      });
      return res.ok ? await res.json() : null;
    },
    [runId],
  );

  // Safe client-side hydration for localStorage
  useEffect(() => {
    try {
      const savedStreak = localStorage.getItem("scouted_unlimited_streak");
      const savedBest = localStorage.getItem("scouted_unlimited_best_streak");
      if (savedStreak !== null) setStreak(Number(savedStreak) || 0);
      if (savedBest !== null) setBestStreak(Number(savedBest) || 0);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("scouted_unlimited_streak", String(streak));
    } catch {}
  }, [streak]);

  useEffect(() => {
    try {
      localStorage.setItem("scouted_unlimited_best_streak", String(bestStreak));
    } catch {}
  }, [bestStreak]);

  // `scouted:stats` is what the leaderboard and the stats bar read. Without
  // this the board showed a ten-run while that store still said zero.
  useEffect(() => {
    if (!bestStreak && !streak) return;
    setStats((prev) => {
      const unlimited = prev.unlimited;
      if (unlimited.current === streak && unlimited.best >= bestStreak) return prev;
      const next = {
        ...prev,
        unlimited: {
          ...unlimited,
          current: streak,
          best: Math.max(unlimited.best, bestStreak),
        },
      };
      saveStats(next);
      return next;
    });
  }, [streak, bestStreak]);

  const guesses = boards[mode];
  const hasSurrendered = surrendered[mode];

  const guessed = useMemo(() => new Set(guesses.map((g) => g.id)), [guesses]);
  const won = solvedId[mode] !== null;
  const over =
    mode === "unlimited"
      ? won || runEnded || hasSurrendered
      : won || hasSurrendered || guesses.length >= MAX_GUESSES;
  // Sent by the server once the round can no longer be played, never before.
  const answerName = reveal[mode];
  const left = MAX_GUESSES - guesses.length;

  function selectMode(next: Mode) {
    setMode(next);
    setConfirmingGiveUp(false);
    if (next === "unlimited" && !runId && !runBusy) void startRun();
  }

  async function nextPlayer() {
    setSurrendered((s) => ({ ...s, unlimited: false }));
    setConfirmingGiveUp(false);
    setLostStreak(null);
    setRound((r) => r + 1);
    // A finished run cannot continue, so a new one is started instead.
    if (runEnded || !runId) {
      await startRun();
      return;
    }
    resetRound();
    await runAction("next");
  }

  async function giveUp() {
    setSurrendered((s) => ({ ...s, [mode]: true }));
    setConfirmingGiveUp(false);
    // Daily has no run to end; the server is asked for the answer instead.
    if (mode !== "unlimited") {
      await judgeDaily(guesses.map((g) => g.id), true);
      return;
    }
    const body = await runAction("give-up");
    setRunEnded(true);
    if (body?.answer) setReveal((r) => ({ ...r, unlimited: body.answer }));
    if (streak > 0) {
      setLostStreak(streak);
      setSavePrompt(streak);
    }
    setStreak(0);
  }

  async function handleGuess(player: GuessOption) {
    if (over) return;

    if (mode === "unlimited") {
      if (!runId) return;
      setBoards((b) => ({ ...b, unlimited: [...b.unlimited, player] }));
      const body = await runAction("guess", { guessId: player.id });
      if (!body) return;
      setCells((c) => ({ ...c, unlimited: { ...c.unlimited, [player.id]: body.cells } }));
      if (body.answer) setReveal((r) => ({ ...r, unlimited: body.answer }));
      if (body.solved) {
        setSolvedId((sv) => ({ ...sv, unlimited: player.id }));
        setLostStreak(null);
        setStreak(body.streak);
        setBestStreak((b) => Math.max(b, body.streak));
      } else if (body.over) {
        setRunEnded(true);
        if (streak > 0) {
          setLostStreak(streak);
          setSavePrompt(streak);
        }
        setStreak(0);
      }
      return;
    }

    const next = [...guesses, player];
    setBoards((b) => ({ ...b, daily: next }));
    const ids = next.map((p) => p.id);
    // Written before the verdict arrives, so a reload mid-request still finds
    // the guess; the colours come back from the server on mount.
    saveBoard(puzzleNumber, ids);
    await judgeDaily(ids);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-5xl font-black tracking-tight text-ink sm:text-6xl">
            {/* The ball replaces a letter, so the heading keeps a plain text
                name for anything that reads the page aloud. */}
            <span className="sr-only">Scouted.</span>
            <span aria-hidden className="group bg-[radial-gradient(85%_160%_at_50%_45%,#ffffff_0%,#ffffff_62%,#f4f7ff_82%,var(--color-ink)_100%)] bg-clip-text transition-[color,text-shadow] duration-500 ease-out hover:text-transparent hover:text-shadow-[0_0_12px_rgba(238,241,248,0.3)]">
              Sc<Ball />uted<span className="text-brand">.</span>
            </span>
          </h1>
          <p className="mt-1 text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
            Wordle for football
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
        <nav
          aria-label="Game mode"
          className="flex rounded-full border-2 border-edge bg-surface p-1"
        >
          {MODES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={mode === id ? "page" : undefined}
              onClick={() => selectMode(id)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold
                          transition-colors motion-reduce:transition-none ${
                            mode === id ? `${SILVER} text-canvas` : "text-ink-soft hover:text-ink"
                          }`}
            >
              <Icon aria-hidden className="size-3.5" strokeWidth={2.5} />
              {label}
            </button>
          ))}
        </nav>

        <Link
          href="/rooms"
          className="flex items-center gap-1.5 rounded-full border-2 border-edge bg-surface px-4 py-2
                     text-xs font-bold text-ink-soft hover:text-ink"
        >
          <Users aria-hidden className="size-3.5" strokeWidth={2.5} />
          Friends
        </Link>
        <Link
          href="/leaderboard"
          className="flex items-center gap-1.5 rounded-full border-2 border-edge bg-surface px-4 py-2
                     text-xs font-bold text-ink-soft hover:text-ink"
        >
          <Trophy aria-hidden className="size-3.5" strokeWidth={2.5} />
          Ranks
        </Link>
        <HowToPlay />
        </div>
      </header>

      <div className="mb-6 max-w-xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`${SILVER} rounded-full px-3 py-1 text-[11px] font-bold text-canvas tabular-nums`}>
            {mode === "daily" ? `No. ${puzzleNumber}` : `Round ${round}`}
          </span>
          <span className="text-xs font-bold uppercase tracking-[0.1em] text-ink-soft">
            {mode === "daily" ? puzzleDate : "Unlimited"}
          </span>
          {mode === "unlimited" && (
            <div className="flex items-center gap-1.5 rounded-full border border-edge bg-surface px-3 py-1 text-[11px] font-bold text-ink">
              <Flame
                aria-hidden
                className={`size-3.5 ${
                  streak > 0 ? "fill-brand text-brand" : "text-ink-soft"
                }`}
              />
              <span>
                Streak: <strong className="tabular-nums">{streak}</strong>
              </span>
              {bestStreak > 0 && (
                <span className="font-normal text-ink-soft">
                  (Best: <strong className="font-bold tabular-nums text-ink">{bestStreak}</strong>)
                </span>
              )}
            </div>
          )}
        </div>
        <p className="mt-2 text-sm font-medium leading-relaxed text-ink-soft">
          {mode === "daily"
            ? `One player a day, the same for everyone, until midnight UTC. Guess in ${MAX_GUESSES}.`
            : "A fresh player every round, different for everyone. Keep going as long as you like."}
        </p>
      </div>

      <div className="sticky top-0 z-10 -mx-4 px-4 pb-4 pt-3">
        {/*
          The backdrop is a repeat of the page's own background rather than a
          blur.

          A blurred strip kept showing an edge: first a hard bottom, then hard
          sides once it was masked, then a hard top once it was full-bleed.
          Matching the body's fixed-attachment background removes the problem
          at the source — the strip is indistinguishable from the page, so the
          only visible boundary is the soft bottom fade. Masking a separate
          layer keeps the controls fully opaque rather than fading with it.

          It is centred with a negative offset rather than `-translate-x-1/2`:
          a transform creates a containing block for fixed-attachment
          backgrounds, which made the scrim's gradient render relative to
          itself instead of the viewport and show up as a lighter band — a
          worse seam than the one it replaced.
        */}
        <div
          aria-hidden
          className="page-scrim pointer-events-none absolute inset-y-0 left-[calc(50%-50vw)]
                     w-[100vw]
                     [mask-image:linear-gradient(to_bottom,black_0%,black_62%,transparent_100%)]
                     [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_62%,transparent_100%)]"
        />
        <div className="relative">
        <GuessInput
          players={players}
          guessed={guessed}
          disabled={over || (mode === "unlimited" && (!runId || runBusy))}
          onGuess={handleGuess}
        />
        {/* `runBusy`, not `!runId`: it is true only while /api/runs is in
            flight, so a failed start stops the spinner instead of leaving it
            turning on a screen that is never going to fill. */}
        {runBusy && <Loading label="Starting a run…" className="mt-3" />}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2" aria-live="polite">
          {over ? (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold
                            ${won ? "bg-hit text-white" : `${SILVER} text-canvas`}`}
              >
                {won
                  ? `Got it in ${guesses.length}`
                  : hasSurrendered
                    ? "Gave up"
                    : "Out of guesses"}{" "}
                — it was {answerName ?? "…"}
                {mode === "unlimited" && (
                  <>
                    {won && ` · Streak: ${streak} 🔥`}
                    {!won && lostStreak !== null && ` · Streak ended (was ${lostStreak})`}
                  </>
                )}
              </span>
              {mode === "unlimited" && (
                <button
                  type="button"
                  onClick={nextPlayer}
                  className="flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5
                             text-xs font-bold text-white transition-colors hover:bg-brand-deep motion-reduce:transition-none"
                >
                  <RotateCw aria-hidden className="size-3.5" strokeWidth={2.5} />
                  Next player
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className={`${SILVER} rounded-full px-3.5 py-1.5 text-xs font-bold text-canvas tabular-nums`}>
                  {left} left
                </span>
                {/* Ten pips: the count is legible at a glance, not just as a number. */}
                <span className="flex gap-1" aria-hidden>
                  {Array.from({ length: MAX_GUESSES }, (_, i) => (
                    <span
                      key={i}
                      className={`size-1.5 rounded-full ${
                        i < guesses.length ? "bg-brand" : "bg-ink/15"
                      }`}
                    />
                  ))}
                </span>
              </div>

              {/* What matters is that there is something live to give up on,
                  which in unlimited means a run the server still calls open. */}
              {(mode === "unlimited" ? !!runId && !runEnded : !over) && (
                <div className="flex items-center">
                  {confirmingGiveUp ? (
                    <div className="flex items-center gap-1.5 rounded-full border border-brand/30 bg-surface px-2 py-1">
                      <span className="px-1 text-xs font-semibold text-ink-soft">
                        Give up?
                      </span>
                      <button
                        type="button"
                        onClick={giveUp}
                        className="rounded-full bg-brand px-2.5 py-1 text-xs font-bold text-white transition-colors hover:bg-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 motion-reduce:transition-none"
                      >
                        Reveal player
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingGiveUp(false)}
                        className="rounded-full bg-ink/10 px-2.5 py-1 text-xs font-bold text-ink transition-colors hover:bg-ink/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 motion-reduce:transition-none"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingGiveUp(true)}
                      className="flex items-center gap-1.5 rounded-full border border-edge bg-surface/80 px-3 py-1.5 text-xs font-bold text-ink-soft transition-colors hover:border-brand/40 hover:bg-surface hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 motion-reduce:transition-none"
                    >
                      <Flag aria-hidden className="size-3.5" strokeWidth={2.5} />
                      Give up
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        </div>
      </div>

      {guesses.length === 0 && !over ? (
        <p
          className="mt-8 rounded-[28px] border-2 border-dashed border-edge bg-surface/50 p-8
                     text-center text-sm font-medium text-ink-soft"
        >
          Start with any player from a top-5 league. Even a wrong guess narrows it down.
        </p>
      ) : (
        <ol className="mt-4 flex flex-col-reverse gap-3">
          {guesses.map((guess, i) => (
            <GuessRow
              key={guess.id}
              guess={guess}
              cells={cells[mode][guess.id]}
              correct={solvedId[mode] === guess.id}
              index={i}
            />
          ))}
        </ol>
      )}

      {/* Offered the moment a run ends, which is the only moment the number
          matters. A ten-run went unrecorded because saving it meant finding
          the leaderboard page on your own afterwards. */}
      <SaveStreakDialog
        streak={savePrompt}
        runId={runId}
        onClose={() => setSavePrompt(null)}
      />
    </main>
  );
}
