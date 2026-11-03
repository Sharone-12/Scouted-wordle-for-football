import { Suspense } from "react";
import { connection } from "next/server";
import { Ball } from "@/components/ball";
import { Loading } from "@/components/loading";
import { Game } from "@/components/game";
import data from "@/data/game-players.json";
import { puzzleNumber, toOption, type Player } from "@/lib/game";

// Mapped once at module scope, not per request: this is the list the browser
// searches, and it is all the browser is told.
const options = (data as Player[]).map(toOption);

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
      players={options}
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
            <span aria-hidden className="group bg-[radial-gradient(85%_160%_at_50%_45%,#ffffff_0%,#ffffff_62%,#f4f7ff_82%,var(--color-ink)_100%)] bg-clip-text transition-[color,text-shadow] duration-500 ease-out hover:text-transparent hover:text-shadow-[0_0_12px_rgba(238,241,248,0.3)]">
              Sc<Ball />uted<span className="text-brand">.</span>
            </span>
          </h1>
          <Loading label="Loading today's puzzle…" className="mt-10" />
        </main>
      }
    >
      <DailyGame />
    </Suspense>
  );
}
