import { Suspense } from "react";
import { connection } from "next/server";
import { Ball } from "@/components/ball";
import { Game } from "@/components/game";
import data from "@/data/game-players.json";
import { answerFor, puzzleNumber, type Player } from "@/lib/game";

// The whole pool is guessable; only well-known players can be the answer.
const players = data as Player[];
const answerPool = players.filter((p) => p.answer);

async function DailyGame() {
  // Today's answer depends on the current date, which a prerender is not
  // allowed to read: `connection()` holds this subtree until there is a
  // request, so the puzzle rolls over at midnight instead of at build time.
  await connection();
  const now = new Date();
  // Formatted on the server and passed down as a string: formatting a date in
  // the browser risks a different locale or time zone than the render it is
  // hydrating, which React reports as a mismatch.
  const puzzleDate = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return (
    <Game
      players={players}
      target={answerFor(answerPool, now)}
      puzzleNumber={puzzleNumber(now)}
      puzzleDate={puzzleDate}
    />
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
          <h1 className="text-5xl font-black tracking-tight text-ink sm:text-6xl">
            {/* The ball replaces a letter, so the heading keeps a plain text
                name for anything that reads the page aloud. */}
            <span className="sr-only">Scouted.</span>
            <span aria-hidden>
              Sc<Ball />uted<span className="text-brand">.</span>
            </span>
          </h1>
          <div className="mt-8 h-14 animate-pulse rounded-2xl border-2 border-edge bg-surface/60" />
        </main>
      }
    >
      <DailyGame />
    </Suspense>
  );
}
