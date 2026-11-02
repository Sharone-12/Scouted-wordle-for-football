"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Flag, Flame, Infinity as InfinityIcon, RotateCw } from "lucide-react";
import { Ball } from "@/components/ball";
import { GuessInput } from "@/components/guess-input";
import { GuessRow } from "@/components/guess-row";
import { StatsBar, StreakChip } from "@/components/stats-bar";
import { MAX_GUESSES, isWin, randomAnswer, type Mode, type Player } from "@/lib/game";
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

  const guesses = boards[mode];
  const target = mode === "daily" ? dailyTarget : practice;
  const hasSurrendered = surrendered[mode];

  const guessed = useMemo(() => new Set(guesses.map((g) => g.id)), [guesses]);
  const won = !!target && guesses.some((g) => isWin(g, target));
  const over = won || hasSurrendered || guesses.length >= MAX_GUESSES;
  const left = MAX_GUESSES - guesses.length;

  function selectMode(next: Mode) {
    setMode(next);
    setConfirmingGiveUp(false);
    if (next === "unlimited" && !practice) setPractice(randomAnswer(answerPool));
  }

  function nextPlayer() {
    setPractice((prev) => randomAnswer(answerPool, prev ?? undefined));
    setBoards((b) => ({ ...b, unlimited: [] }));
    setSurrendered((s) => ({ ...s, unlimited: false }));
    setConfirmingGiveUp(false);
    setLostStreak(null);
    setRound((r) => r + 1);
  }

  function giveUp() {
    setSurrendered((s) => ({ ...s, [mode]: true }));
    setConfirmingGiveUp(false);
    if (mode === "unlimited") {
      if (streak > 0) setLostStreak(streak);
      setStreak(0);
    }
  }

  function handleGuess(player: Player) {
    if (over || !target) return;
    const isWinningGuess = isWin(player, target);
    setBoards((b) => ({ ...b, [mode]: [...b[mode], player] }));

    if (mode === "unlimited") {
      if (isWinningGuess) {
        setLostStreak(null);
        setStreak((prev) => {
          const next = prev + 1;
          setBestStreak((b) => Math.max(b, next));
          return next;
        });
      } else if (guesses.length + 1 >= MAX_GUESSES) {
        if (streak > 0) setLostStreak(streak);
        setStreak(0);
      }
    }
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

        <nav
          aria-label="Game mode"
          className="flex rounded-full border-2 border-ink/12 bg-white p-1"
        >
          {MODES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={mode === id ? "page" : undefined}
              onClick={() => selectMode(id)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold
                          transition-colors motion-reduce:transition-none ${
                            mode === id ? "bg-ink text-white" : "text-ink-soft hover:text-ink"
                          }`}
            >
              <Icon aria-hidden className="size-3.5" strokeWidth={2.5} />
              {label}
            </button>
          ))}
        </nav>
      </header>

      <div className="mb-6 max-w-xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-ink px-3 py-1 text-[11px] font-bold text-white tabular-nums">
            {mode === "daily" ? `No. ${puzzleNumber}` : `Round ${round}`}
          </span>
          <span className="text-xs font-bold uppercase tracking-[0.1em] text-ink-soft">
            {mode === "daily" ? puzzleDate : "Unlimited"}
          </span>
          {mode === "unlimited" && (
            <div className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-3 py-1 text-[11px] font-bold text-ink">
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

      <div className="sticky top-0 z-10 -mx-4 bg-canvas/80 px-4 pb-4 pt-3 backdrop-blur-md">
        <GuessInput
          players={players}
          guessed={guessed}
          disabled={over || !target}
          onGuess={handleGuess}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2" aria-live="polite">
          {over && target ? (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold text-white
                            ${won ? "bg-hit" : "bg-ink"}`}
              >
                {won
                  ? `Got it in ${guesses.length}`
                  : hasSurrendered
                    ? "Gave up"
                    : "Out of guesses"}{" "}
                — it was {target.name}
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
                <span className="rounded-full bg-ink px-3.5 py-1.5 text-xs font-bold text-white tabular-nums">
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

              {target && (
                <div className="flex items-center">
                  {confirmingGiveUp ? (
                    <div className="flex items-center gap-1.5 rounded-full border border-brand/30 bg-white px-2 py-1">
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
                      className="flex items-center gap-1.5 rounded-full border border-ink/15 bg-white/80 px-3 py-1.5 text-xs font-bold text-ink-soft transition-colors hover:border-brand/40 hover:bg-white hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 motion-reduce:transition-none"
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

      {(guesses.length === 0 && !over) || !target ? (
        <p
          className="mt-8 rounded-[28px] border-2 border-dashed border-ink/15 bg-white/50 p-8
                     text-center text-sm font-medium text-ink-soft"
        >
          Start with any player from a top-5 league. Even a wrong guess narrows it down.
        </p>
      ) : (
        <ol className="mt-4 flex flex-col-reverse gap-3">
          {guesses.map((guess, i) => (
            <GuessRow key={guess.id} guess={guess} target={target} index={i} />
          ))}
          {over && !won && target && (
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
    </main>
  );
}
