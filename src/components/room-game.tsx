"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Crown, Timer } from "lucide-react";
import { GuessInput } from "@/components/guess-input";
import { GuessRow } from "@/components/guess-row";
import { Loading } from "@/components/loading";
import { compare, isWin, MAX_GUESSES, type GuessOption, type Player } from "@/lib/game";
import { SILVER } from "@/lib/utils";
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
  //
  // The request is fired once per round and deliberately not cleaned up: this
  // effect re-runs every time the clock ticks, and a `clearTimeout` cleanup
  // cancelled the pending call every 500ms, so the 1.2s timer never fired and
  // the game sat on a finished round forever.
  const advanced = useRef<string | null>(null);
  useEffect(() => {
    if (!room || room.status !== "playing") return;
    if (!roundOver(room, players, results, now)) return;
    const key = `${room.code}:${room.current_round}`;
    if (advanced.current === key) return;
    advanced.current = key;
    setTimeout(() => post({ action: "next" }), 1200);
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
    return (
      <main className="mx-auto max-w-3xl px-4 py-14">
        <Loading label="Loading room…" />
      </main>
    );
  }

  const isHost = me === room.host_id;
  const table = standings(players, results);
  const answeredThisRound = new Set(
    results.filter((r) => r.round === room.current_round).map((r) => r.player_id),
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <Link href="/" className="text-xs font-bold uppercase tracking-[0.18em] text-ink-soft">
        ← Scouted
      </Link>

      {/* Lobby: the code is the whole job of this screen, so it gets a pane of
          its own at a size that can be read across a room or off a photo. */}
      {room.status === "lobby" && (
        <section className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="rounded-[28px] border-2 border-edge bg-surface p-6">
            <h1 className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft">
              Room code
            </h1>
            <div className="mt-3 flex items-center gap-2">
              {room.code.split("").map((ch, i) => (
                <span
                  key={i}
                  className={`${SILVER} grid size-14 place-items-center rounded-2xl text-3xl
                             font-black text-canvas sm:size-16 sm:text-4xl`}
                >
                  {ch}
                </span>
              ))}
              <button
                type="button"
                title="Copy the room code"
                onClick={() => navigator.clipboard?.writeText(room.code)}
                className="ml-1 rounded-full border-2 border-edge bg-surface p-2.5 text-ink-soft
                           hover:text-ink"
              >
                <Copy aria-hidden className="size-4" strokeWidth={2.5} />
                <span className="sr-only">Copy room code</span>
              </button>
            </div>
            <p className="mt-3 text-sm font-medium text-ink-soft">
              Send this to anyone you want in the game.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-1">
            <Tile label="Rounds" value={room.rounds} />
            <Tile label="Per round" value={`${room.round_seconds}s`} />
            <Tile label="Players" value={players.length} />
          </div>
        </section>
      )}

      {/* Playing: the clock is what matters, so it takes the top. */}
      {room.status === "playing" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-black tracking-tight tabular-nums">
            Round {room.current_round}
            <span className="text-ink-soft">/{room.rounds}</span>
          </h1>
          <span
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold
                        tabular-nums ${left <= 10 ? "bg-brand text-white" : `${SILVER} text-canvas`}`}
          >
            <Timer aria-hidden className="size-4" strokeWidth={2.5} />
            {left}s
          </span>
        </div>
      )}

      {room.status === "done" && (
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Final standings</h1>
      )}

      {/* Every player gets a card rather than a list row. */}
      <section className="mt-4">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft">
          {room.status === "done" ? "Results" : `Players (${players.length})`}
        </h2>
        {/* Two columns only in the lobby, where nobody is ranked yet. Once
            there are positions the list has to read top to bottom, or second
            place sits to the right of first and the order looks arbitrary. */}
        <ol className={`mt-2 grid gap-2 ${room.status === "lobby" ? "sm:grid-cols-2" : ""}`}>
          {table.map((row) => {
            const isMe = row.player_id === me;
            const answered = answeredThisRound.has(row.player_id);
            const podium = room.status === "done" && row.rank === 1;
            return (
              <li
                key={row.player_id}
                className={`flex items-center gap-3 rounded-3xl border-2 p-3
                            ${podium ? "border-hit bg-hit-soft" : "border-edge bg-surface"}`}
              >
                {room.status !== "lobby" && (
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-xl text-sm font-black
                                tabular-nums ${podium ? "bg-hit text-white" : "bg-canvas-deep text-ink-soft"}`}
                  >
                    {row.rank}
                  </span>
                )}
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-2xl text-sm font-black
                              ${isMe ? "bg-brand text-white" : "bg-canvas-deep text-ink"}`}
                  aria-hidden
                >
                  {row.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-bold">{row.name}</span>
                    {row.player_id === room.host_id && (
                      <Crown aria-hidden className="size-3.5 shrink-0 text-close" strokeWidth={2.5} />
                    )}
                    {isMe && (
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] text-brand">
                        you
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-soft">
                    {room.status === "lobby"
                      ? "Ready"
                      : room.status === "done"
                        ? `${row.solved} of ${room.rounds} solved`
                        : answered
                          ? "Answered"
                          : "Playing…"}
                  </span>
                </span>
                <span className="text-xl font-black tabular-nums">{row.score}</span>
              </li>
            );
          })}
        </ol>
      </section>

      {room.status === "lobby" && (
        <div className="mt-4">
          {isHost ? (
            <button
              type="button"
              onClick={() => post({ action: "start" })}
              className="h-14 w-full rounded-2xl bg-brand text-sm font-bold text-white
                         hover:bg-brand-deep"
            >
              Start {room.rounds} rounds · {room.round_seconds}s each
            </button>
          ) : (
            <p className="rounded-3xl border-2 border-dashed border-edge bg-surface/50 p-5
                          text-center text-sm font-medium text-ink-soft">
              Waiting for the host to start.
            </p>
          )}
        </div>
      )}

      {room.status === "done" && (
        <Link
          href="/rooms"
          className={`${SILVER} mt-4 block h-14 rounded-2xl pt-4 text-center text-sm font-bold text-canvas`}
        >
          New room
        </Link>
      )}

      {room.status === "playing" && target && (
        <>
          <div className="mt-5">
            <GuessInput
              players={allPlayers}
              guessed={new Set(guesses.map((g) => g.id))}
              disabled={finished || expired}
              // The list offers the trimmed record; the room keeps the full
              // one, which is what the comparison below needs.
              onGuess={(p) => {
                const full = byId.get(p.id);
                if (full) setGuesses((g) => [...g, full]);
              }}
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
              // The room holds the answer client-side, so the comparison is
              // made here rather than inside the row.
              <GuessRow
                key={guess.id}
                guess={guess}
                cells={compare(guess, target)}
                correct={isWin(guess, target)}
                index={i}
              />
            ))}
          </ol>
        </>
      )}
    </main>
  );
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-edge
                    bg-surface px-4 py-3 sm:min-w-28">
      <span className="text-2xl font-black tabular-nums leading-none">{value}</span>
      <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-soft">
        {label}
      </span>
    </div>
  );
}
