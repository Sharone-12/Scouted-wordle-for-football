export { cn } from "cn"

/**
 * The "on" face of a toggle, and every other solid-white control.
 *
 * Flat white reads as a hole punched in the floodlit surface; a brushed
 * gradient with a bevel line and a faint halo reads as a lit control. Written
 * as utilities rather than a custom `@utility` because the latter is only
 * emitted in production builds, not by the dev server.
 */
export const SILVER =
  "bg-[linear-gradient(162deg,#ffffff_0%,var(--color-ink)_42%,#ccd3e6_100%)] " +
  "shadow-[inset_0_1px_0_rgb(255_255_255/0.85),0_0_10px_rgb(238_241_248/0.22)]";
