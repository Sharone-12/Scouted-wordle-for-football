import { MAX_GUESSES } from "./game.ts";

export type RoomStatus = "lobby" | "playing" | "done";

export type Room = {
  code: string;
  host_id: string;
  status: RoomStatus;
  rounds: number;
  round_seconds: number;
  current_round: number;
  answer_ids: number[];
  round_started_at: string | null;
};

export type RoomPlayer = { player_id: string; name: string; score: number };
export type RoomResult = {
  player_id: string;
  round: number;
  solved: boolean;
  guesses: number | null;
  points: number;
};

export const ROUND_CHOICES = [3, 5, 10] as const;
export const SECONDS_CHOICES = [60, 90, 120] as const;

/** No vowels, no 0/O/1/I: a code gets read aloud and typed in by hand. */
const ALPHABET = "BCDFGHJKLMNPQRSTVWXYZ23456789";

export function makeCode(random = Math.random): string {
  let code = "";
  for (let i = 0; i < 4; i++) code += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return code;
}

/** The most a fast finish can add. Deliberately below the 10 points a single
 *  guess is worth, so speed can only ever separate equal guess counts. */
export const MAX_TIME_BONUS = 9;

/**
 * Points for one round.
 *
 * Guesses decide it: solving first try is 100, each further guess costs 10.
 * Time only breaks ties. The bonus tops out at 9, one short of a guess, which
 * guarantees that solving in fewer guesses always outscores solving in more,
 * however slow you were. Two players on the same guess count are separated by
 * who got there first.
 */
export function scoreRound(
  solved: boolean,
  guesses: number,
  secondsRemaining = 0,
  roundSeconds = 0,
): number {
  if (!solved) return 0;
  const used = Math.min(Math.max(guesses, 1), MAX_GUESSES);
  const base = (MAX_GUESSES + 1 - used) * 10;
  if (roundSeconds <= 0) return base;
  const share = Math.min(Math.max(secondsRemaining, 0), roundSeconds) / roundSeconds;
  return base + Math.round(MAX_TIME_BONUS * share);
}

/** Seconds left in the round, floored at zero. */
export function secondsLeft(room: Room, now = Date.now()): number {
  if (room.status !== "playing" || !room.round_started_at) return room.round_seconds;
  const elapsed = (now - new Date(room.round_started_at).getTime()) / 1000;
  return Math.max(0, Math.ceil(room.round_seconds - elapsed));
}

/** A round ends when everyone has posted a result or the clock runs out. */
export function roundOver(room: Room, players: RoomPlayer[], results: RoomResult[], now = Date.now()) {
  const done = results.filter((r) => r.round === room.current_round).length;
  return done >= players.length || secondsLeft(room, now) <= 0;
}

export type Standing = RoomPlayer & { solved: number; rank: number };

/**
 * Final table: most points first. Ties are broken by who solved more rounds,
 * then by name so the order is stable rather than whatever the database
 * happened to return, and genuine ties share a rank.
 */
export function standings(players: RoomPlayer[], results: RoomResult[]): Standing[] {
  const solvedBy = new Map<string, number>();
  for (const r of results) {
    if (r.solved) solvedBy.set(r.player_id, (solvedBy.get(r.player_id) ?? 0) + 1);
  }
  const rows = players
    .map((p) => ({ ...p, solved: solvedBy.get(p.player_id) ?? 0 }))
    // Score already carries the time bonus, so it decides. Rounds solved
    // breaks a dead heat, and the name keeps the order stable rather than
    // whatever the database happened to return.
    .sort((a, b) => b.score - a.score || b.solved - a.solved || a.name.localeCompare(b.name));

  let rank = 0;
  let prev: { score: number; solved: number } | null = null;
  return rows.map((row, i) => {
    if (!prev || row.score !== prev.score || row.solved !== prev.solved) rank = i + 1;
    prev = { score: row.score, solved: row.solved };
    return { ...row, rank };
  });
}
