import { NextResponse } from "next/server";
import data from "@/data/game-players.json";
import { compare, MAX_GUESSES, type Player } from "@/lib/game";
import { serviceClient } from "@/lib/supabase-server";

const players = data as Player[];
const byId = new Map(players.map((p) => [p.id, p]));
const answerPool = players.filter((p) => p.answer);

/**
 * A name used as a LIKE pattern, with the wildcards defanged.
 *
 * `ilike("name", userInput)` treats % and _ as wildcards, so the name "a%"
 * matched somebody else's row and the branch below rewrote their entry. The
 * only matches wanted here are exact ones, case aside.
 */
const likeLiteral = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

type Ctx = { params: Promise<{ id: string }> };
type Run = {
  id: string;
  player_id: string;
  streak: number;
  answer_id: number | null;
  guesses: number;
  seen_ids: number[];
  status: "active" | "ended";
  claimed: boolean;
};

function nextAnswer(seen: number[]): Player {
  const fresh = answerPool.filter((p) => !seen.includes(p.id));
  const pool = fresh.length ? fresh : answerPool;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Every move in an unlimited run.
 *
 * The comparison is computed here rather than in the browser, which is what
 * makes the streak worth putting on a leaderboard: the client is told how its
 * guess compares, never what the answer is, and the streak it reports is the
 * one this table has been counting.
 */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const playerId = String(body.playerId ?? "").slice(0, 64);
  const action = String(body.action ?? "");

  const db = serviceClient();
  const { data: row } = await db.from("runs").select("*").eq("id", id).maybeSingle();
  const run = row as Run | null;
  if (!run) return NextResponse.json({ error: "No such run" }, { status: 404 });
  // The run belongs to whoever started it; another id cannot play or claim it.
  if (run.player_id !== playerId) {
    return NextResponse.json({ error: "Not your run" }, { status: 403 });
  }

  if (action === "guess") {
    if (run.status !== "active" || run.answer_id === null) {
      return NextResponse.json({ error: "This run is over" }, { status: 409 });
    }
    const guess = byId.get(Number(body.guessId));
    const answer = byId.get(run.answer_id);
    if (!guess || !answer) return NextResponse.json({ error: "Unknown player" }, { status: 400 });

    const guesses = run.guesses + 1;
    const solved = guess.id === answer.id;
    const outOfGuesses = !solved && guesses >= MAX_GUESSES;

    // Conditional on the row this request read: two guesses posted at once
    // both saw the same streak, and an unguarded update would let each add one.
    // The second write matches nothing and is told to re-read instead.
    const { data: moved } = await db
      .from("runs")
      .update({
        guesses,
        streak: solved ? run.streak + 1 : run.streak,
        status: outOfGuesses ? "ended" : "active",
        answer_id: solved ? null : run.answer_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("guesses", run.guesses)
      .eq("answer_id", run.answer_id)
      .select("id")
      .maybeSingle();
    if (!moved) {
      return NextResponse.json({ error: "That guess was already counted" }, { status: 409 });
    }

    return NextResponse.json({
      cells: compare(guess, answer),
      solved,
      guesses,
      streak: solved ? run.streak + 1 : run.streak,
      over: outOfGuesses,
      // Only revealed once the round can no longer be played.
      answer: solved || outOfGuesses ? answer.name : null,
    });
  }

  if (action === "next") {
    if (run.status !== "active") {
      return NextResponse.json({ error: "This run is over" }, { status: 409 });
    }
    if (run.answer_id !== null) {
      return NextResponse.json({ error: "Finish this player first" }, { status: 409 });
    }
    const answer = nextAnswer(run.seen_ids);
    // Only the first of two concurrent "next" calls deals a player; the second
    // would otherwise overwrite answer_id and lose a row from seen_ids.
    const { data: dealt } = await db
      .from("runs")
      .update({
        answer_id: answer.id,
        guesses: 0,
        seen_ids: [...run.seen_ids, answer.id],
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .is("answer_id", null)
      .select("id")
      .maybeSingle();
    if (!dealt) {
      return NextResponse.json({ error: "A player is already in play" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, streak: run.streak, guesses: 0 });
  }

  if (action === "give-up") {
    if (run.status !== "active") return NextResponse.json({ ok: true, streak: run.streak });
    const answer = run.answer_id ? byId.get(run.answer_id) : null;
    await db
      .from("runs")
      .update({ status: "ended", updated_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ ok: true, streak: run.streak, answer: answer?.name ?? null });
  }

  if (action === "claim") {
    const name = String(body.name ?? "").trim().slice(0, 24);
    if (!name) return NextResponse.json({ error: "A name is required" }, { status: 400 });
    if (run.status !== "ended") {
      return NextResponse.json({ error: "Finish the run first" }, { status: 409 });
    }
    if (run.claimed) return NextResponse.json({ ok: true, best: run.streak, changed: false });
    if (run.streak < 1) return NextResponse.json({ error: "Nothing to post" }, { status: 400 });

    // The run is marked claimed before the board is touched, not after: two
    // claims arriving together would both pass the check above, and marking
    // last let each of them write. Whoever flips the flag owns the write.
    const { data: marked } = await db
      .from("runs")
      .update({ claimed: true })
      .eq("id", id)
      .eq("claimed", false)
      .select("id")
      .maybeSingle();
    if (!marked) return NextResponse.json({ ok: true, best: run.streak, changed: false });

    // The streak written here is this table's count, not a number the client
    // sent, so the board records what was actually played.
    const existing = await db
      .from("leaderboard")
      .select("id,streak")
      .ilike("name", likeLiteral(name))
      .maybeSingle();

    let changed = true;
    let best = run.streak;
    if (existing.data) {
      if (existing.data.streak >= run.streak) {
        changed = false;
        best = existing.data.streak;
      } else {
        await db
          .from("leaderboard")
          .update({ name, streak: run.streak, created_at: new Date().toISOString() })
          .eq("id", existing.data.id);
      }
    } else {
      const { error } = await db.from("leaderboard").insert({ name, streak: run.streak });
      if (error && error.code !== "23505") {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, best, changed });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
