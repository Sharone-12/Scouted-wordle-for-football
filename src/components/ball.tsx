import Image from "next/image";

/**
 * The football that stands in for the "o" in Scouted.
 *
 * Sized in `em` so it tracks the heading's font-size instead of needing a
 * value per breakpoint. 0.56em is Geist's x-height (~0.52em) plus a little
 * overshoot, which is what a round letter needs to look level with the flat
 * ones beside it; at 0.78em the ball stood as tall as the capital S.
 */
export function Ball({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/ball.png"
      alt=""
      width={256}
      height={256}
      priority
      className={`inline-block size-[0.56em] translate-y-[0.02em] align-baseline ${className}`}
    />
  );
}
