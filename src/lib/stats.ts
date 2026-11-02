import { MAX_GUESSES, type Mode } from "./game.ts";

export type ModeStats = {
  played: number;
  won: number;
  current: number;
  best: number;
};

export type Stats = {
  daily: ModeStats & {
    /** Puzzle number of the last finished daily, for detecting a skipped day. */
    lastPuzzle: number | null;
    /** distribution[i] = games won in i+1 guesses. */
    distribution: number[];
  };
  unlimited: ModeStats;
};

export const EMPTY: Stats = {
  daily: {
    played: 0,
    won: 0,
    current: 0,
    best: 0,
    lastPuzzle: null,
    distribution: Array(MAX_GUESSES).fill(0),
  },
  unlimited: { played: 0, won: 0, current: 0, best: 0 },
};

/**
 * A finished daily.
 *
 * The streak only survives if this puzzle is the one straight after the last
 * finished puzzle: winning today and winning a week ago is not a streak of
 * two. A puzzle already recorded changes nothing, so a refresh cannot inflate
 * the numbers.
 */
export function recordDaily(stats: Stats, puzzle: number, won: boolean, guesses: number): Stats {
  const d = stats.daily;
  if (d.lastPuzzle !== null && puzzle <= d.lastPuzzle) return stats;

  const continues = won && d.lastPuzzle === puzzle - 1;
  const current = won ? (continues ? d.current + 1 : 1) : 0;
  const distribution = d.distribution.slice();
  if (won && guesses >= 1 && guesses <= MAX_GUESSES) distribution[guesses - 1] += 1;

  return {
    ...stats,
    daily: {
      played: d.played + 1,
      won: d.won + (won ? 1 : 0),
      current,
      best: Math.max(d.best, current),
      lastPuzzle: puzzle,
      distribution,
    },
  };
}

/** A finished unlimited round. Every round counts; a loss ends the streak. */
export function recordUnlimited(stats: Stats, won: boolean): Stats {
  const u = stats.unlimited;
  const current = won ? u.current + 1 : 0;
  return {
    ...stats,
    unlimited: {
      played: u.played + 1,
      won: u.won + (won ? 1 : 0),
      current,
      best: Math.max(u.best, current),
    },
  };
}

export const winRate = (s: ModeStats) => (s.played ? Math.round((s.won / s.played) * 100) : 0);

export const statsFor = (stats: Stats, mode: Mode): ModeStats =>
  mode === "daily" ? stats.daily : stats.unlimited;

// ── storage ───────────────────────────────────────────────────────────────
// Every read and write is guarded: localStorage throws outright in a private
// window and in some embedded webviews, and a crashing stats panel must not
// take the game down with it.

const KEY = "scouted:stats";
const BOARD_KEY = "scouted:daily-board";

export function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Stats>;
    // Merged rather than trusted: a stored blob from an older build can be
    // missing fields the UI reads.
    return {
      daily: { ...EMPTY.daily, ...parsed.daily },
      unlimited: { ...EMPTY.unlimited, ...parsed.unlimited },
    };
  } catch {
    return EMPTY;
  }
}

export function saveStats(stats: Stats): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(stats));
  } catch {
    /* storage unavailable or full; the game still plays */
  }
}

/** Today's in-progress board, so a refresh does not wipe it. */
export function loadBoard(puzzle: number): number[] {
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    if (!raw) return [];
    const saved = JSON.parse(raw) as { puzzle: number; ids: number[] };
    return saved.puzzle === puzzle && Array.isArray(saved.ids) ? saved.ids : [];
  } catch {
    return [];
  }
}

export function saveBoard(puzzle: number, ids: number[]): void {
  try {
    localStorage.setItem(BOARD_KEY, JSON.stringify({ puzzle, ids }));
  } catch {
    /* storage unavailable; the board just will not survive a refresh */
  }
}
