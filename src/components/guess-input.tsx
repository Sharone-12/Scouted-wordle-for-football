"use client";

import { useMemo, useRef, useState } from "react";
import { search, roleLabel, type GuessOption } from "@/lib/game";

type Props = {
  players: GuessOption[];
  guessed: Set<number>;
  disabled: boolean;
  onGuess: (player: GuessOption) => void;
};

export function GuessInput({ players, guessed, disabled, onGuess }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(
    () => search(players, query).filter((p) => !guessed.has(p.id)),
    [players, query, guessed],
  );

  function submit(player: GuessOption | undefined) {
    if (!player) return;
    onGuess(player);
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!matches.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + matches.length) % matches.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      submit(matches[active]);
    } else if (e.key === "Escape") {
      setQuery("");
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={matches.length > 0}
        aria-controls="guess-options"
        aria-autocomplete="list"
        aria-label="Guess a player"
        autoComplete="off"
        disabled={disabled}
        value={query}
        placeholder={disabled ? "Game over" : "Guess a player…"}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        className="h-14 w-full rounded-2xl border-2 border-edge bg-surface px-5 text-base
                   font-semibold outline-none placeholder:font-medium placeholder:text-ink-soft/60
                   focus-visible:border-brand
                   disabled:cursor-not-allowed disabled:bg-canvas-deep disabled:text-ink-soft"
      />

      {matches.length > 0 && (
        <ul
          id="guess-options"
          role="listbox"
          className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border-2
                     border-edge bg-surface"
        >
          {matches.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                // Mouse down rather than click: the input blurring first would
                // close the list before the click ever lands.
                onMouseDown={(e) => {
                  e.preventDefault();
                  submit(p);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-baseline justify-between gap-3 px-5 py-3 text-left
                            ${i === active ? "bg-brand text-white" : "bg-surface"}`}
              >
                <span className="font-bold">{p.name}</span>
                <span className={`text-xs ${i === active ? "text-white/80" : "text-ink-soft"}`}>
                  {p.team} · {roleLabel(p.role)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
