"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Contrast, HelpCircle, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { MAX_GUESSES } from "@/lib/game";

const SEEN_KEY = "scouted:seen-how-to-play";

/** A sample cell, so the rules are shown in the thing they describe rather
 *  than only written out. */
function Cell({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: "hit" | "close" | "miss";
  icon: React.ReactNode;
}) {
  const tones = {
    hit: "bg-hit text-white border-hit",
    close: "bg-close text-ink border-close",
    miss: "bg-miss text-ink-soft border-edge",
  };
  return (
    <div className={`rounded-2xl border-2 px-3 py-2 ${tones[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] opacity-70">
          {label}
        </span>
        {icon}
      </div>
      <div className="truncate text-[15px] font-bold tabular-nums">{value}</div>
    </div>
  );
}

const icon = "size-3.5";

const STEPS = [
  {
    title: "Guess the mystery player",
    body: `Type any player from a top-5 European league. You get ${MAX_GUESSES} guesses, and every one of them tells you something.`,
    art: (
      <div className="grid grid-cols-2 gap-2">
        <Cell label="Club" value="Arsenal" tone="miss" icon={<X className={`${icon} opacity-40`} strokeWidth={3} />} />
        <Cell label="Country" value="England" tone="miss" icon={<X className={`${icon} opacity-40`} strokeWidth={3} />} />
      </div>
    ),
  },
  {
    title: "Green means you got it",
    body: "Each guess is broken into eight attributes. Green is an exact match on that attribute — the answer shares it.",
    art: (
      <div className="grid grid-cols-2 gap-2">
        <Cell label="League" value="La Liga" tone="hit" icon={<Check className={icon} strokeWidth={3} />} />
        <Cell label="Position" value="Winger" tone="hit" icon={<Check className={icon} strokeWidth={3} />} />
      </div>
    ),
  },
  {
    title: "Amber means close",
    body: "The right league but the wrong club. The right continent but the wrong country. The right part of the pitch but the wrong role. Tap an amber cell and it tells you which.",
    art: (
      <div className="grid grid-cols-2 gap-2">
        <Cell label="Club" value="FC Barcelona" tone="close" icon={<Contrast className={icon} strokeWidth={3} />} />
        <Cell label="Country" value="Spain" tone="close" icon={<Contrast className={icon} strokeWidth={3} />} />
      </div>
    ),
  },
  {
    title: "Arrows point at the answer",
    body: "On goals, assists, league titles and Champions Leagues, an arrow says whether the answer's number is higher or lower than your guess.",
    art: (
      <div className="grid grid-cols-2 gap-2">
        <Cell label="Career goals" value="53" tone="miss" icon={<ArrowUp className={icon} strokeWidth={3} />} />
        <Cell label="League titles" value="3" tone="miss" icon={<ArrowDown className={icon} strokeWidth={3} />} />
      </div>
    ),
  },
  {
    title: "Three ways to play",
    body: "Daily is one player for everyone, every day. Unlimited keeps dealing new players for as long as you like. Friends puts you in a room with a code, a timer and a scoreboard.",
    art: null,
  },
];

export function HowToPlay() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  // Opens by itself the first time, because nobody reads a help button.
  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      /* private windows: just leave it closed */
    }
  }, []);

  function close() {
    setOpen(false);
    setStep(0);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* nothing to remember it with; it will show again */
    }
  }

  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setStep(0);
          setOpen(true);
        }}
        className="flex items-center gap-1.5 rounded-full border-2 border-edge bg-surface px-4 py-2
                   text-xs font-bold text-ink-soft hover:text-ink"
      >
        <HelpCircle aria-hidden className="size-3.5" strokeWidth={2.5} />
        How to play
      </button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="max-w-md rounded-[28px] border-2 border-edge bg-surface p-6 text-ink">
          <DialogTitle className="text-xl font-extrabold tracking-tight">
            {current.title}
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm font-medium leading-relaxed text-ink-soft">
            {current.body}
          </DialogDescription>

          {current.art && <div className="mt-5">{current.art}</div>}

          <div className="mt-6 flex items-center gap-3">
            <span className="flex gap-1.5" aria-hidden>
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`size-2 rounded-full ${i === step ? "bg-brand" : "bg-ink/15"}`}
                />
              ))}
            </span>
            <span className="sr-only" aria-live="polite">
              Step {step + 1} of {STEPS.length}
            </span>

            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="ml-auto rounded-full px-3 py-2 text-xs font-bold text-ink-soft hover:text-ink"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? close() : setStep((s) => s + 1))}
              className={`${step > 0 ? "" : "ml-auto"} rounded-full bg-brand px-5 py-2.5 text-xs
                          font-bold text-white hover:bg-brand-deep`}
            >
              {last ? "Play" : "Next"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
