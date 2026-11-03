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

/**
 * `fetch` that answers `null` instead of throwing.
 *
 * Offline, `fetch` rejects rather than returning a failed response, so every
 * line after the `await` — clearing a spinner, rolling a guess back — was
 * never reached and the page sat there loading for good. A refused request
 * and a request that never left are the same thing to the caller: no body.
 */
export async function postJson<T>(url: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}
