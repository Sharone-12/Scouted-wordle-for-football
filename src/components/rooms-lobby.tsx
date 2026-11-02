"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Ball } from "@/components/ball";
import { playerId, rememberName, savedName } from "@/lib/identity";
import { ROUND_CHOICES, SECONDS_CHOICES } from "@/lib/room";

export function RoomsLobby() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [rounds, setRounds] = useState<number>(5);
  const [seconds, setSeconds] = useState<number>(90);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setName(savedName()), []);

  async function create() {
    if (!name.trim()) return setError("Pick a name first");
    setBusy(true);
    setError("");
    rememberName(name.trim());
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hostId: playerId(), name: name.trim(), rounds, roundSeconds: seconds }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Could not create the room");
    router.push(`/rooms/${body.code}`);
  }

  async function join() {
    const room = code.trim().toUpperCase();
    if (!name.trim()) return setError("Pick a name first");
    if (room.length !== 4) return setError("Room codes are four characters");
    setBusy(true);
    setError("");
    rememberName(name.trim());
    const res = await fetch(`/api/rooms/${room}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "join", playerId: playerId(), name: name.trim() }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Could not join");
    router.push(`/rooms/${room}`);
  }

  const field =
    "h-11 w-full rounded-2xl border-2 border-ink/15 bg-white px-4 text-base font-semibold " +
    "outline-none placeholder:font-medium placeholder:text-ink-soft/60 focus-visible:border-brand";
  const chip = (on: boolean) =>
    `rounded-full px-2.5 py-1 text-xs font-bold ${on ? "bg-ink text-white" : "bg-white text-ink-soft border-2 border-ink/12"}`;

  return (
    // One screen, no scrolling: `h-dvh` tracks the visible viewport on mobile
    // where the browser chrome comes and goes, and the two cards sit side by
    // side from the small breakpoint up so nothing falls below the fold.
    <main className="flex h-dvh flex-col overflow-hidden px-4 py-5">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4">
        <div>
          <Link href="/" className="text-xs font-bold uppercase tracking-[0.18em] text-ink-soft">
            ← Back
          </Link>
          <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
            <span className="sr-only">Scouted with friends</span>
            <span aria-hidden>
              Sc<Ball />uted<span className="text-brand">.</span>
            </span>
          </h1>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-soft">
            Play with friends
          </p>
        </div>

        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft">
            Your name
          </span>
          <input
            className={`mt-1.5 ${field}`}
            value={name}
            maxLength={24}
            placeholder="Name"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <section className="rounded-3xl border-2 border-ink/12 bg-white p-4">
            <h2 className="text-base font-extrabold tracking-tight">Create a room</h2>
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="w-14 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft">
                  Rounds
                </span>
                {ROUND_CHOICES.map((r) => (
                  <button key={r} type="button" className={chip(rounds === r)} onClick={() => setRounds(r)}>
                    {r}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="w-14 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft">
                  Timer
                </span>
                {SECONDS_CHOICES.map((sec) => (
                  <button key={sec} type="button" className={chip(seconds === sec)} onClick={() => setSeconds(sec)}>
                    {sec}s
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={create}
              className="mt-4 h-11 w-full rounded-2xl bg-brand text-sm font-bold text-white
                         hover:bg-brand-deep disabled:opacity-50"
            >
              Create room
            </button>
          </section>

          <section className="rounded-3xl border-2 border-ink/12 bg-white p-4">
            <h2 className="text-base font-extrabold tracking-tight">Join a room</h2>
            <input
              className={`mt-3 ${field} text-center text-xl font-black uppercase tracking-[0.3em]`}
              value={code}
              maxLength={4}
              placeholder="CODE"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && join()}
            />
            <button
              type="button"
              disabled={busy}
              onClick={join}
              className="mt-3 h-11 w-full rounded-2xl bg-ink text-sm font-bold text-white
                         hover:bg-ink/90 disabled:opacity-50"
            >
              Join
            </button>
          </section>
        </div>

        {/* Reserved rather than conditional, so an error appearing does not
            shift the cards and push something off a short screen. */}
        <p role="alert" className="min-h-5 text-sm font-bold text-brand-deep">
          {error}
        </p>
      </div>
    </main>
  );
}
