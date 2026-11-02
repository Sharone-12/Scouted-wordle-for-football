import { NextResponse } from "next/server";
import data from "@/data/game-players.json";
import { answerFor, compare, MAX_GUESSES, puzzleNumber, type Player } from "@/lib/game";

const players = data as Player[];
const byId = new Map(players.map((p) => [p.id, p]));
const answerPool = players.filter((p) => p.answer);

/**
 * The day's puzzle, judged here.
 *
 * The answer used to be handed to the browser as a prop, which put it in the
 * page source: two greps and the player had it. Now the client posts the ids
 * it has guessed and is told only how each one compares.
 *
 * Deliberately stateless — the board itself still lives in localStorage. The
 * whole list is posted rather than one guess, so a reload rebuilds the same
 * colours from the same call, and replaying the list cannot change anything.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body.guessIds)
    ? body.guessIds.slice(0, MAX_GUESSES).map(Number)
    : [];

  const answer = answerFor(answerPool, new Date());
  const guesses = ids.map((id) => byId.get(id)).filter((p): p is Player => !!p);

  const cells: Record<number, ReturnType<typeof compare>> = {};
  for (const guess of guesses) cells[guess.id] = compare(guess, answer);

  const solved = guesses.some((g) => g.id === answer.id);
  const over = solved || guesses.length >= MAX_GUESSES || body.gaveUp === true;

  return NextResponse.json({
    cells,
    solvedId: solved ? answer.id : null,
    over,
    // The name is the one thing withheld until the puzzle cannot be played.
    answer: over ? answer.name : null,
    puzzleNumber: puzzleNumber(),
  });
}
