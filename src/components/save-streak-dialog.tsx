"use client";

import { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { SILVER } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { playerId, rememberName, savedName } from "@/lib/identity";

/**
 * Offered the moment an unlimited run ends, because that is the only moment
 * the player cares about the number. Asking them to find the leaderboard page
 * afterwards is how a ten-run goes unrecorded.
 */
export function SaveStreakDialog({
  streak,
  runId,
  onClose,
}: {
  streak: number | null;
  /** The finished run to claim. Without one there is nothing verified to post. */
  runId: string | null;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (streak !== null) {
      setName(savedName());
      setState("idle");
      setError("");
    }
  }, [streak]);

  async function submit() {
    if (!name.trim()) return setError("Pick a name first");
    setState("sending");
    setError("");
    rememberName(name.trim());
    // The streak is not sent: the server posts the figure it counted while
    // judging this run, so the board cannot be told a number.
    const res = await fetch(`/api/runs/${runId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "claim", playerId: playerId(), name: name.trim() }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setState("idle");
      return setError(body.error ?? "Could not save it");
    }
    setState("done");
  }

  return (
    <Dialog open={streak !== null && !!runId} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-sm rounded-[28px] border-2 border-edge bg-surface p-6 text-ink">
        <DialogTitle className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
          <Flame aria-hidden className="size-5 text-brand" strokeWidth={2.5} />
          {streak} in a row
        </DialogTitle>

        {state === "done" ? (
          <>
            <DialogDescription className="mt-2 text-sm font-medium text-ink-soft">
              Saved to the leaderboard.
            </DialogDescription>
            <button
              type="button"
              onClick={onClose}
              className={`${SILVER} mt-5 h-12 w-full rounded-2xl text-sm font-bold text-canvas`}
            >
              Keep playing
            </button>
          </>
        ) : (
          <>
            <DialogDescription className="mt-2 text-sm font-medium leading-relaxed text-ink-soft">
              That run is over. Put a name to it and it goes on the leaderboard.
            </DialogDescription>
            <input
              value={name}
              maxLength={24}
              placeholder="Name"
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="mt-4 h-12 w-full rounded-2xl border-2 border-edge bg-surface px-4
                         text-base font-semibold outline-none focus-visible:border-brand"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-12 flex-1 rounded-2xl border-2 border-edge text-sm font-bold text-ink-soft"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={state === "sending"}
                className="h-12 flex-[2] rounded-2xl bg-brand text-sm font-bold text-white
                           hover:bg-brand-deep disabled:opacity-50"
              >
                {state === "sending" ? "Saving…" : "Save to leaderboard"}
              </button>
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm font-bold text-brand-deep">
                {error}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
