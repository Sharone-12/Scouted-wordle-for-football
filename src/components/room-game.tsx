"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Crown, Timer } from "lucide-react";
import { GuessInput } from "@/components/guess-input";
import { GuessRow } from "@/components/guess-row";
import { MAX_GUESSES, isWin, type Player } from "@/lib/game";
import { playerId } from "@/lib/identity";
import {
  roundOver,
  secondsLeft,
  standings,
  type Room,
  type RoomPlayer,
  type RoomResult,
} from "@/lib/room";
import { browserClient } from "@/lib/supabase";

type State = { room: Room | null; players: RoomPlayer[]; results: RoomResult[] };

export function RoomGame({ code, players: allPlayers }: { code: string; players: Player[] }) {
  const [me, setMe] = useState("");
  const [state, setState] = useState<State>({ room: null, players: [], results: [] });
  const [guesses, setGuesses] = useState<Player[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");

  const byId = useMemo(() => new Map(allPlayers.map((p) => [p.id, p])), [allPlayers]);
  const { room, players, results } = state;

  useEffect(() => setMe(playerId()), []);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/rooms/${code}`, { cache: "no-store" });
    if (!res.ok) return setError("That room no longer exists");
    setState(await res.json());
  }, [code]);

  useEffect(() => {
    refresh();
    // Realtime beats polling here: a round change has to reach every player at
    // the same moment, not up to an interval late.
    const supabase = browserClient();
    const channel = supabase
      .channel(`room:${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `code=eq.${code}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_players", filter: `room_code=eq.${code}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_results", filter: `room_code=eq.${code}` }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [code, refresh]);

  // One ticking clock for the whole component.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      await fetch(`/api/rooms/${code}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId: playerId(), ...body }),
      });
    },
    [code],
  );

  const target = room && room.status === "playing"
    ? byId.get(room.answer_ids[room.current_round - 1]) ?? null
    : null;

  const won = !!target && guesses.some((g) => isWin(g, target));
  const finished = won || guesses.length >= MAX_GUESSES;
  const left = room ? secondsLeft(room, now) : 0;
  const expired = room?.status === "playing" && left <= 0;
  const myResult = results.find((r) => r.player_id === me && r.round === room?.current_round);

  // A new round means a clean board.
  const roundKey = `${room?.status}:${room?.current_round}`;
  const lastRound = useRef(roundKey);
  useEffect(() => {
    if (lastRound.current !== roundKey) {
      lastRound.current = roundKey;
      setGuesses([]);
    }
  }, [roundKey]);

  // Report the round once it is settled, by solving it or by running out of
  // guesses or time. Posting again is harmless: the server keeps the first.
  useEffect(() => {
    if (!room || room.status !== "playing" || myResult) return;
    if (!finished && !expired) return;
    post({ action: "result", solved: won, guesses: guesses.length });
  }, [room, myResult, finished, expired, won, guesses.length, post]);

  // Advance when the round is genuinely over. The server checks this too, so
  // several clients asking at once cannot skip a round.
  useEffect(() => {
    if (!room || room.status !== "playing") return;
    if (!roundOver(room, players, results, now)) return;
    const id = setTimeout(() => post({ action: "next" }), 1200);
    return () => clearTimeout(id);
  }, [room, players, results, now, post]);

  if (error) {
    return (
      <main className="mx-auto max-w-xl px-4 py-14">
        <p className="text-sm font-bold text-brand-deep">{error}</p>
        <Link href="/rooms" className="mt-4 inline-block text-sm font-bold underline">
          Back to rooms
        </Link>
      </main>
    );
  }
  if (!room) {
    return <main className="mx-auto max-w-xl px-4 py-14 text-sm font-medium text-ink-soft">Loading room…</main>;
  }

  const isHost = me === room.host_id;
  const table = standings(players, results);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-xs font-bold uppercase tracking-[0.18em] text-ink-soft">
            ← Scouted
          </Link>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-3xl font-black tracking-tight tabular-nums">{room.code}</h1>
            <button
              type="button"
              title="Copy the room code"
              onClick={() => navigator.clipboard?.writeText(room.code)}
              className="rounded-full border-2 border-ink/12 bg-white p-1.5 text-ink-soft hover:text-ink"
            >
              <Copy aria-hidden className="size-3.5" strokeWidth={2.5} />
              <span className="sr-only">Copy room code</span>
            </button>
          </div>
        </div>
        {room.status === "playing" && (
          <span
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold text-white tabular-nums
                        ${left <= 10 ? "bg-brand" : "bg-ink"}`}
          >
            <Timer aria-hidden className="size-3.5" strokeWidth={2.5} />
            {left}s · round {room.current_round}/{room.rounds}
          </span>
        )}
      </div>

      <section className="mt-6 rounded-[28px] border-2 border-ink/12 bg-white p-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-ink-soft">
          {room.status === "done" ? "Final standings" : `Players (${players.length})`}
        </h2>
        <ol className="mt-3 space-y-1.5">
          {table.map((row) => (
            <li key={row.player_id} className="flex items-center gap-3 text-sm font-bold">
              <span className="w-5 text-right tabular-nums text-ink-soft">
                {room.status === "done" ? row.rank : "·"}
              </span>
              {row.player_id === room.host_id && (
                <Crown aria-hidden className="size-3.5 text-close" strokeWidth={2.5} />
              )}
              <span className={row.player_id === me ? "text-brand" : ""}>{row.name}</span>
              <span className="ml-auto tabular-nums">{row.score}</span>
            </li>
          ))}
        </ol>

        {room.status === "lobby" &&
          (isHost ? (
            <button
              type="button"
              onClick={() => post({ action: "start" })}
              className="mt-5 h-12 w-full rounded-2xl bg-brand text-sm font-bold text-white hover:bg-brand-deep"
            >
              Start {room.rounds} rounds · {room.round_seconds}s each
            </button>
          ) : (
            <p className="mt-5 text-sm font-medium text-ink-soft">
              Waiting for the host to start. Share the code <strong>{room.code}</strong>.
            </p>
          ))}

        {room.status === "done" && (
          <Link
            href="/rooms"
            className="mt-5 block h-12 rounded-2xl bg-ink pt-3.5 text-center text-sm font-bold text-white"
          >
            New room
          </Link>
        )}
      </section>

      {room.status === "playing" && target && (
        <>
          <div className="mt-6">
            <GuessInput
              players={allPlayers}
              guessed={new Set(guesses.map((g) => g.id))}
              disabled={finished || expired}
              onGuess={(p) => setGuesses((g) => [...g, p])}
            />
            <p className="mt-2 text-xs font-bold text-ink-soft" aria-live="polite">
              {won
                ? `Solved in ${guesses.length} — waiting for the others`
                : expired
                  ? `Time. It was ${target.name}`
                  : finished
                    ? `Out of guesses. It was ${target.name}`
                    : `${MAX_GUESSES - guesses.length} guesses left`}
            </p>
          </div>
          <ol className="mt-4 flex flex-col-reverse gap-3">
            {guesses.map((guess, i) => (
              <GuessRow key={guess.id} guess={guess} target={target} index={i} />
            ))}
          </ol>
        </>
      )}
    </main>
  );
}
