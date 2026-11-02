import { NextResponse } from "next/server";
import data from "@/data/game-players.json";
import type { Player } from "@/lib/game";
import { serviceClient } from "@/lib/supabase-server";

const answerPool = (data as Player[]).filter((p) => p.answer);

/** Generous for a person, flat for a script: a run takes minutes to play. */
const RUNS_PER_HOUR = 60;

/** Start an unlimited run. The answer is chosen here and never sent back. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const playerId = String(body.playerId ?? "").slice(0, 64);
  if (!playerId) return NextResponse.json({ error: "Missing player" }, { status: 400 });

  const db = serviceClient();

  // A run is a database row anyone can create by posting an id, so the count
  // is capped per id per hour. Counted in the table rather than in memory
  // because instances are recycled and a per-process tally resets with them.
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await db
    .from("runs")
    .select("id", { count: "exact", head: true })
    .eq("player_id", playerId)
    .gte("created_at", since);
  if ((count ?? 0) >= RUNS_PER_HOUR) {
    return NextResponse.json(
      { error: "Too many runs started. Try again later." },
      { status: 429, headers: { "retry-after": "600" } },
    );
  }

  const answer = answerPool[Math.floor(Math.random() * answerPool.length)];
  const { data: run, error } = await db
    .from("runs")
    .insert({ player_id: playerId, answer_id: answer.id, seen_ids: [answer.id] })
    .select("id,streak")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ runId: run.id, streak: run.streak, guesses: 0 });
}
