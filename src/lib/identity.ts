/** A stable id for this browser, so a refresh rejoins as the same player. */
const KEY = "scouted:player-id";
const NAME_KEY = "scouted:player-name";

export function playerId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    // Private windows block storage; a per-session id still lets the player
    // finish the game they are in, they just cannot rejoin after a refresh.
    return crypto.randomUUID();
  }
}

export function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* nothing to do */
  }
}
