export type Player = {
  id: number;
  name: string;
  team: string;
  teamId: number;
  league: string;
  leagueId: number;
  country: string;
  continent: string;
  role: string;
  goals: number;
  assists: number;
  ucl: number;
  titles: number;
  /** Sofascore followers: how well known the player is. */
  followers: number;
  answer: boolean;
};

export type CellState = "hit" | "close" | "miss";

export type Cell = {
  key: string;
  label: string;
  value: string;
  state: CellState;
  /** Set when the target's number is higher ("up") or lower ("down"). */
  dir?: "up" | "down";
  /**
   * Why a cell came out amber. It explains the rule that was met, never the
   * answer: "right continent, wrong country" is a hint, naming the country
   * would be the solution.
   */
  note?: string;
};

export const MAX_GUESSES = 10;

/** Roles that count as "close" to each other: same line of the pitch. */
const LINES: { name: string; roles: string[] }[] = [
  { name: "goalkeeper", roles: ["GK"] },
  { name: "defence", roles: ["CB", "FB"] },
  { name: "midfield", roles: ["DM", "CM", "AM"] },
  { name: "attack", roles: ["W", "ST"] },
];

const ROLE_LABEL: Record<string, string> = {
  GK: "Goalkeeper",
  CB: "Centre-back",
  FB: "Full-back",
  DM: "Defensive mid",
  CM: "Central mid",
  AM: "Attacking mid",
  W: "Winger",
  ST: "Striker",
};

export const roleLabel = (role: string) => ROLE_LABEL[role] ?? role;

const lineOf = (role: string) => LINES.find((l) => l.roles.includes(role));

const sameLine = (a: string, b: string) => {
  const line = lineOf(a);
  return !!line && line.roles.includes(b);
};

/**
 * Career totals never match exactly, so a near miss still counts as a hit —
 * but only in proportion to the number. A flat ±3 floor made 0, 1, 2, 3 and 4
 * assists all read green against a target of 1, so green stopped meaning
 * anything on the small numbers where players most need the signal. Ten per
 * cent and nothing more: exact below ten, ±37 on Kane's 373.
 */
const band = (target: number) => Math.floor(Math.abs(target) * 0.1);

function numeric(
  key: string,
  label: string,
  guess: number,
  target: number,
  tolerance: number,
): Cell {
  const diff = target - guess;
  if (Math.abs(diff) <= tolerance) return { key, label, value: String(guess), state: "hit" };
  return {
    key,
    label,
    value: String(guess),
    state: "miss",
    dir: diff > 0 ? "up" : "down",
  };
}

export function compare(guess: Player, target: Player): Cell[] {
  return [
    {
      key: "team",
      label: "Club",
      value: guess.team,
      // Same league is the useful near miss here; the league column alone
      // would not tell you a wrong club was at least the right country.
      state: guess.team === target.team ? "hit" : guess.league === target.league ? "close" : "miss",
      note:
        guess.team !== target.team && guess.league === target.league
          ? `Right league, wrong club. The answer also plays in the ${guess.league}.`
          : undefined,
    },
    {
      key: "league",
      label: "League",
      value: guess.league,
      state: guess.league === target.league ? "hit" : "miss",
    },
    {
      key: "country",
      label: "Country",
      value: guess.country,
      state:
        guess.country === target.country
          ? "hit"
          : guess.continent === target.continent
            ? "close"
            : "miss",
      note:
        guess.country !== target.country && guess.continent === target.continent
          ? `Right continent, wrong country. The answer is from ${guess.continent} too.`
          : undefined,
    },
    {
      key: "role",
      label: "Position",
      value: roleLabel(guess.role),
      state:
        guess.role === target.role ? "hit" : sameLine(guess.role, target.role) ? "close" : "miss",
      note:
        guess.role !== target.role && sameLine(guess.role, target.role)
          ? `Right part of the pitch, wrong role. The answer also plays in ${lineOf(guess.role)?.name}.`
          : undefined,
    },
    numeric("ucl", "UCLs", guess.ucl, target.ucl, 0),
    numeric("titles", "League titles", guess.titles, target.titles, 0),
    numeric("goals", "Career goals", guess.goals, target.goals, band(target.goals)),
    numeric("assists", "Career assists", guess.assists, target.assists, band(target.assists)),
  ];
}

export const isWin = (guess: Player, target: Player) => guess.id === target.id;

/** Day 0 of the game. Puzzle numbers count from here. */
export const EPOCH = Date.UTC(2026, 10, 1);
const DAY = 86_400_000;

/** The UTC day a date falls on, so the puzzle turns over at the same instant
 *  worldwide rather than at each player's local midnight. */
export const puzzleNumber = (date = new Date()) =>
  Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - EPOCH) / DAY) + 1;

/** Deterministic PRNG: the same seed gives the same stream everywhere. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates driven by a seeded PRNG, so every client shuffles identically. */
function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = items.slice();
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The day's answer: identical for every player, and no repeat until the whole
 * pool has been used.
 *
 * Hashing the date and taking it modulo the pool picks at random *with*
 * replacement, which can serve the same player twice in one week while others
 * never appear. Instead the pool is shuffled once per cycle and dealt out in
 * order, so 221 players means 221 days before anyone comes round again, and
 * each cycle is shuffled differently.
 */
export function answerFor(pool: Player[], date = new Date()): Player {
  const n = puzzleNumber(date) - 1;
  const size = pool.length;
  const cycle = Math.floor(n / size);
  const position = ((n % size) + size) % size;
  return seededShuffle(pool, cycle + 1)[position];
}

export type Mode = "daily" | "unlimited";

/**
 * A random answer for unlimited mode, never the one just played.
 *
 * It draws from the same recognizable pool as the daily puzzle rather than all
 * 2894 squad players: "random" has to stay guessable, or the mode is just a
 * list of strangers.
 */
export function randomAnswer(pool: Player[], exclude?: Player): Player {
  const choices = exclude && pool.length > 1 ? pool.filter((p) => p.id !== exclude.id) : pool;
  return choices[Math.floor(Math.random() * choices.length)];
}

/**
 * Lowercase and strip accents, so typing "modric" finds "Luka Modrić" and
 * "alvarez" finds "Julián Alvarez". Without this, every player with a
 * diacritic in their name is unreachable by anyone typing plain ASCII.
 */
const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function search(players: Player[], query: string, limit = 8): Player[] {
  const q = fold(query.trim());
  if (!q) return [];
  const starts: Player[] = [];
  const contains: Player[] = [];
  for (const p of players) {
    const name = fold(p.name);
    if (name.startsWith(q)) starts.push(p);
    else if (name.includes(q)) contains.push(p);
  }
  // Best-known first inside each group. Scanning in name order instead put
  // whichever reserve happened to sort first ahead of the player everyone
  // actually meant — typing "thiago" offered a Castilla teenager.
  const byFame = (a: Player, b: Player) => b.followers - a.followers;
  return [...starts.sort(byFame), ...contains.sort(byFame)].slice(0, limit);
}
