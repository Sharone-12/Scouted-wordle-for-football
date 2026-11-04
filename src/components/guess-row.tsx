import { ArrowDown, ArrowUp, Check, ChevronRight, Contrast, Eye, X } from "lucide-react";
import { type Cell, type GuessOption } from "@/lib/game";

// Each result state gets a saturated fill of its own. Colour is never the only
// signal: every cell also carries an icon, so the board still reads with the
// colours stripped out.
const TONE: Record<Cell["state"], string> = {
  hit: "bg-hit text-white border-hit",
  close: "bg-close text-ink border-close",
  miss: "bg-miss text-ink-soft border-edge",
};

const UCL_TONE: Record<Cell["state"], string> = {
  hit: "border-hit text-white",
  close: "border-close text-white",
  miss: "border-white/20 text-white",
};

const UCL_ICON: Record<Cell["state"], string> = {
  hit: "text-emerald-300",
  close: "text-close",
  miss: "text-white/70",
};

function Mark({ cell, className = "" }: { cell: Cell; className?: string }) {
  const props = {
    className: `size-3.5 ${className}`,
    strokeWidth: 3,
    "aria-hidden": true,
  } as const;
  if (cell.state === "hit") return <Check {...props} />;
  if (cell.dir === "up") return <ArrowUp {...props} />;
  if (cell.dir === "down") return <ArrowDown {...props} />;
  if (cell.state === "close") return <Contrast {...props} />;
  return <X {...props} className={`size-3.5 opacity-40 ${className}`} />;
}

function hint(cell: Cell) {
  if (cell.state === "hit") return "correct";
  if (cell.dir === "up") return "the answer is higher";
  if (cell.dir === "down") return "the answer is lower";
  if (cell.state === "close") return "close";
  return "wrong";
}

function CellBody({
  cell,
  iconClass = "",
  affordance,
}: {
  cell: Cell;
  iconClass?: string;
  affordance?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] opacity-70">
          {cell.label}
        </span>
        <span className="flex items-center gap-1">
          {affordance}
          <Mark cell={cell} className={iconClass} />
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="truncate text-[15px] font-bold tabular-nums">{cell.value}</span>
      </div>
      <span className="sr-only">{hint(cell)}</span>
    </>
  );
}

function UclCell({ cell }: { cell: Cell }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 bg-[#0a1046] ${UCL_TONE[cell.state]}`}
      title={`${cell.label}: ${cell.value} — ${hint(cell)}`}
    >
      <div className="relative px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] opacity-80">
            {cell.label}
          </span>
          <Mark cell={cell} className={UCL_ICON[cell.state]} />
        </div>
        <div className="truncate text-[15px] font-bold tabular-nums">{cell.value}</div>
        <span className="sr-only">{hint(cell)}</span>
      </div>
    </div>
  );
}

function CellBox({ cell }: { cell: Cell }) {
  if (cell.key === "ucl") return <UclCell cell={cell} />;

  const className = `rounded-2xl border-2 px-3 py-2.5 ${TONE[cell.state]}`;

  if (cell.note) {
    return (
      <details className={`${className} group [&_summary::-webkit-details-marker]:hidden`}>
        {/*
          The trigger is a chevron on the label line, not a row of its own: an
          extra line made the amber cell taller than the three beside it and
          broke the grid.
        */}
        <summary
          className="cursor-pointer list-none rounded-lg outline-none
                     focus-visible:ring-2 focus-visible:ring-ink/40"
          aria-label={`${cell.label}: ${cell.value}, close. Show why.`}
        >
          <CellBody
            cell={cell}
            affordance={
              <ChevronRight
                aria-hidden
                className="size-3 opacity-70 transition-transform group-open:rotate-90 motion-reduce:transition-none"
                strokeWidth={3}
              />
            }
          />
        </summary>
        <p className="mt-2 border-t-2 border-edge pt-2 text-[11px] font-medium leading-snug">
          {cell.note}
        </p>
      </details>
    );
  }

  return (
    <div className={className} title={`${cell.label}: ${cell.value} — ${hint(cell)}`}>
      <CellBody cell={cell} />
    </div>
  );
}

export function GuessRow({
  guess,
  index,
  isAnswer = false,
  statusLabel,
  cells = [],
  correct = false,
}: {
  guess: GuessOption;
  index: number;
  isAnswer?: boolean;
  statusLabel?: string;
  /** The verdict on this guess. Whoever holds the answer works it out. */
  cells?: Cell[];
  correct?: boolean;
}) {

  return (
    <li
      className={`rounded-[28px] border-2 p-4 sm:p-5 transition-all motion-reduce:transition-none
                  ${
                    isAnswer
                      ? "border-brand bg-surface"
                      : correct
                        ? "border-hit bg-hit-soft"
                        : "border-edge bg-surface"
                  }`}
    >
      <div className="mb-3 flex items-center gap-3">
        <span
          className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold
                      ${
                        isAnswer
                          ? "bg-brand text-white"
                          : correct
                            ? "bg-hit text-white"
                            : "bg-canvas-deep text-ink-soft"
                      }`}
        >
          {isAnswer ? <Eye aria-hidden className="size-3.5" strokeWidth={2.5} /> : index + 1}
        </span>
        <div>
          {isAnswer && (
            <span className="block text-[10px] font-bold uppercase tracking-wider text-brand">
              Mystery Player
            </span>
          )}
          <h3 className="text-lg font-extrabold tracking-tight">{guess.name}</h3>
        </div>
        {isAnswer ? (
          <span className="ml-auto rounded-full bg-brand px-3 py-1 text-xs font-bold text-white">
            {statusLabel ?? "Revealed"}
          </span>
        ) : correct ? (
          <span className="ml-auto rounded-full bg-hit px-3 py-1 text-xs font-bold text-white">
            Correct
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 items-start gap-2 sm:grid-cols-4">
        {cells.map((cell, i) => (
          // Staggered per cell, so the row turns over one tile at a time.
          <div
            key={cell.key}
            className="tile-flip relative motion-reduce:animate-none"
            style={{ animationDelay: `${i * 160}ms` }}
          >
            {/*
              The blank face, covering the result until the tile is edge-on.
              It is hidden from assistive tech and from pointers, so the real
              cell underneath stays reachable, and it is dropped entirely under
              reduced motion rather than being left stuck over the result.
            */}
            <div
              aria-hidden
              className="tile-face pointer-events-none absolute inset-0 z-10 rounded-2xl
                         border-2 border-edge bg-canvas-deep motion-reduce:hidden"
              style={{ animationDelay: `${i * 160}ms` }}
            />
          <CellBox cell={cell} />
          </div>
        ))}
      </div>

      {/*
        Repeated on every guess rather than printed once at the top, so the
        arrows can be read without scrolling back. It is dropped when the row
        has no arrows at all, where it would explain nothing.
      */}
      {cells.some((c) => c.dir) && (
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-ink-soft">
          <span className="flex items-center gap-1">
            <ArrowUp aria-hidden className="size-3" strokeWidth={3} />
            the answer has more
          </span>
          <span className="flex items-center gap-1">
            <ArrowDown aria-hidden className="size-3" strokeWidth={3} />
            the answer has fewer
          </span>
        </p>
      )}
    </li>
  );
}
