"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { rememberName, savedName } from "@/lib/identity";
import { loadStats } from "@/lib/stats";

/** Posts the player's best unlimited streak, which is kept in this browser. */
export function SubmitStreak() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [best, setBest] = useState(0);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    setName(savedName());
    // Two stores have held this number at different times, so the higher of
    // the pair is the honest answer rather than whichever one happens to be
    // read first.
    let legacy = 0;
    try {
      legacy = Number(localStorage.getItem("scouted_unlimited_best_streak")) || 0;
    } catch {
      /* storage unavailable */
    }
    setBest(Math.max(loadStats().unlimited.best, legacy));
  }, []);

  if (best < 1) {
    return (
      <p className="mt-8 text-sm font-medium text-ink-soft">
        Win a few unlimited rounds in a row and your streak can go up here.
      </p>
    );
  }

  async function submit() {
    if (!name.trim()) return setError("Pick a name first");
    setState("sending");
    setError("");
    rememberName(name.trim());
    const res = await fetch("/api/leaderboard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim(), streak: best }),
    });
    if (!res.ok) {
      setState("idle");
      const body = await res.json().catch(() => ({}));
      return setError(body.error ?? "Could not submit");
    }
    setState("done");
    router.refresh();
  }

  return (
    <section className="mt-8 rounded-[28px] border-2 border-ink/12 bg-white p-5">
      <h2 className="text-lg font-extrabold tracking-tight">
        Your best run: <span className="tabular-nums">{best}</span>
      </h2>
      {state === "done" ? (
        <p className="mt-3 text-sm font-bold text-hit">Posted.</p>
      ) : (
        <div className="mt-4 flex gap-2">
          <input
            value={name}
            maxLength={24}
            placeholder="Name"
            onChange={(e) => setName(e.target.value)}
            className="h-12 flex-1 rounded-2xl border-2 border-ink/15 bg-white px-4 text-base
                       font-semibold outline-none focus-visible:border-brand"
          />
          <button
            type="button"
            onClick={submit}
            disabled={state === "sending"}
            className="h-12 shrink-0 rounded-2xl bg-brand px-5 text-sm font-bold text-white
                       hover:bg-brand-deep disabled:opacity-50"
          >
            Post
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm font-bold text-brand-deep">
          {error}
        </p>
      )}
    </section>
  );
}
