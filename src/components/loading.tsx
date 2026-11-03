import Image from "next/image";

/**
 * The waiting state: the football spins while a route, a room or a run is
 * still on its way.
 *
 * Deliberately not a `<main>` — the home and leaderboard fallbacks already
 * have one around their heading, so callers pass spacing via `className`.
 */
export function Loading({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <p
      role="status"
      className={`flex items-center gap-3 text-sm font-medium text-ink-soft ${className}`}
    >
      <Image
        src="/ball.png"
        alt=""
        width={64}
        height={64}
        className="size-6 animate-spin [animation-duration:900ms] motion-reduce:animate-none"
      />
      {label}
    </p>
  );
}
