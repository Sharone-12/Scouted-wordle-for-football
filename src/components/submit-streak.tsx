import Link from "next/link";

/**
 * There is nothing to submit here any more.
 *
 * A streak reaches the board from a finished unlimited run, counted by the
 * server, so the old name-and-number form has no honest version.
 */
export function SubmitStreak() {
  return (
    <p className="mt-8 rounded-[28px] border-2 border-dashed border-ink/15 bg-white/50 p-5
                  text-center text-sm font-medium text-ink-soft">
      Streaks are posted at the end of an{" "}
      <Link href="/" className="font-bold text-ink underline">
        unlimited run
      </Link>
      . Only runs played through are counted.
    </p>
  );
}
