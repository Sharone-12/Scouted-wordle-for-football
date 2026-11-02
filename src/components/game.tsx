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
import { GuessRow } from "@/components/guess-row";
import { SaveStreakDialog } from "@/components/save-streak-dialog";
import { HowToPlay } from "@/components/how-to-play";
import { StatsBar, StreakChip } from "@/components/stats-bar";
import { MAX_GUESSES, isWin, type Cell, type Mode, type Player } from "@/lib/game";
import { playerId } from "@/lib/identity";
import {
  EMPTY,
  loadBoard,
  loadStats,
  recordDaily,
  recordUnlimited,
  saveBoard,
  saveStats,
  statsFor,
  type Stats,
} from "@/lib/stats";

const MODES: { id: Mode; label: string; icon: typeof CalendarDays }[] = [
  { id: "daily", label: "Daily", icon: CalendarDays },
  { id: "unlimited", label: "Unlimited", icon: InfinityIcon },
];

export function Game({
  players,
  target: dailyTarget,
  puzzleNumber,
  puzzleDate,
}: {
  players: Player[];
  target: Player;
  puzzleNumber: number;
  puzzleDate: string;
}) {
  const answerPool = useMemo(() => players.filter((p) => p.answer), [players]);

  const [mode, setMode] = useState<Mode>("daily");
  // Each mode keeps its own board, so switching to practise a few and coming
  // back does not throw away the day's progress.
  const [boards, setBoards] = useState<Record<Mode, Player[]>>({ daily: [], unlimited: [] });
  const [surrendered, setSurrendered] = useState<Record<Mode, boolean>>({
    daily: false,
    unlimited: false,
  });
  const [confirmingGiveUp, setConfirmingGiveUp] = useState(false);
  // Picked on the client, never during render: Math.random() in a server
  // render and again on hydration gives two different players.
  const [practice, setPractice] = useState<Player | null>(null);
  const [round, setRound] = useState(1);
  const [stats, setStats] = useState<Stats>(EMPTY);

  // localStorage is read after mount, never during render: the server has no
  // access to it, and seeding state from it directly makes the first client
  // render disagree with the HTML it is hydrating.
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  useEffect(() => {
    setStats(loadStats());
    const saved = loadBoard(puzzleNumber)
      .map((id) => byId.get(id))
      .filter((p): p is Player => !!p);
    if (saved.length) setBoards((b) => ({ ...b, daily: saved }));
  }, [puzzleNumber, byId]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [lostStreak, setLostStreak] = useState<number | null>(null);
  const [savePrompt, setSavePrompt] = useState<number | null>(null);

  // A verified unlimited run lives on the server: it picks each answer, judges
  // each guess and counts the streak, so the board is a record of play rather
  // than a number this browser chose. The answer is never sent here until the
  // round is over.
  const [runId, setRunId] = useState<string | null>(null);
  const [runCells, setRunCells] = useState<Record<number, Cell[]>>({});
  const [runSolvedId, setRunSolvedId] = useState<number | null>(null);
  const [runEnded, setRunEnded] = useState(false);
  const [reveal, setReveal] = useState<string | null>(null);
  const [runBusy, setRunBusy] = useState(false);

  const resetRound = useCallback(() => {
    setRunCells({});
    setRunSolvedId(null);
    setReveal(null);
    setBoards((b) => ({ ...b, unlimited: [] }));
  }, []);

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
  const target = mode === "daily" ? dailyTarget : practice;
  const hasSurrendered = surrendered[mode];

  const guessed = useMemo(() => new Set(guesses.map((g) => g.id)), [guesses]);
  const verified = mode === "unlimited";
  const won = verified
    ? runSolvedId !== null
    : !!target && guesses.some((g) => isWin(g, target));
  const over = verified
    ? won || runEnded || hasSurrendered
    : won || hasSurrendered || guesses.length >= MAX_GUESSES;
  // The answer's name arrives from the server once the round can no longer be
  // played; in daily the client already holds it.
  const answerName = verified ? reveal : (target?.name ?? null);
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
    if (mode !== "unlimited") return;
    const body = await runAction("give-up");
    setRunEnded(true);
    if (body?.answer) setReveal(body.answer);
    if (streak > 0) {
      setLostStreak(streak);
      setSavePrompt(streak);
    }
    setStreak(0);
  }

  async function handleGuess(player: Player) {
    if (over) return;

    if (mode === "unlimited") {
      if (!runId) return;
      setBoards((b) => ({ ...b, unlimited: [...b.unlimited, player] }));
      const body = await runAction("guess", { guessId: player.id });
      if (!body) return;
      setRunCells((c) => ({ ...c, [player.id]: body.cells }));
      if (body.answer) setReveal(body.answer);
      if (body.solved) {
        setRunSolvedId(player.id);
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

    if (!target) return;
    const isWinningGuess = isWin(player, target);
    setBoards((b) => ({ ...b, [mode]: [...b[mode], player] }));
    void isWinningGuess;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-5xl font-black tracking-tight text-ink sm:text-6xl">
            {/* The ball replaces a letter, so the heading keeps a plain text
                name for anything that reads the page aloud. */}
            <span className="sr-only">Scouted.</span>
            <span aria-hidden>
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
                            mode === id ? "bg-ink text-canvas" : "text-ink-soft hover:text-ink"
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
          <span className="rounded-full bg-ink px-3 py-1 text-[11px] font-bold text-canvas tabular-nums">
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
        */}
        <div
          aria-hidden
          className="page-scrim pointer-events-none absolute inset-y-0 left-1/2 w-screen
                     -translate-x-1/2
                     [mask-image:linear-gradient(to_bottom,black_0%,black_62%,transparent_100%)]
                     [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_62%,transparent_100%)]"
        />
        <div className="relative">
        <GuessInput
          players={players}
          guessed={guessed}
          disabled={over || (verified ? !runId || runBusy : !target)}
          onGuess={handleGuess}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2" aria-live="polite">
          {over && (verified ? true : !!target) ? (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold
                            ${won ? "bg-hit text-white" : "bg-ink text-canvas"}`}
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
                <span className="rounded-full bg-ink px-3.5 py-1.5 text-xs font-bold text-canvas tabular-nums">
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

              {/* A verified run has no client-side target, so gating on one hid
                  Give up in unlimited entirely. What matters is that there is
                  something live to give up on. */}
              {(verified ? !!runId && !runEnded : !!target) && (
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

      {/* A verified run never hands the client a target, so requiring one here
          meant unlimited always fell through to the empty state and no guess
          ever appeared on the board. */}
      {(guesses.length === 0 && !over) || (!verified && !target) ? (
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
              target={verified ? undefined : (target ?? undefined)}
              cells={verified ? runCells[guess.id] : undefined}
              correct={verified ? runSolvedId === guess.id : undefined}
              index={i}
            />
          ))}
          {/* The reveal row needs the answer as a player object, which a
              verified run never hands over, so there it is a plain line. */}
          {over && !won && !verified && target && (
            <GuessRow
              guess={target}
              target={target}
              index={guesses.length}
              isAnswer
              statusLabel={hasSurrendered ? "Revealed" : "Missed"}
            />
          )}
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
