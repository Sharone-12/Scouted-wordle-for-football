import { NextResponse } from "next/server";
import data from "@/data/game-players.json";
import type { Player } from "@/lib/game";
import { serviceClient } from "@/lib/supabase-server";

const answerPool = (data as Player[]).filter((p) => p.answer);

/** Start an unlimited run. The answer is chosen here and never sent back. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const playerId = String(body.playerId ?? "").slice(0, 64);
  if (!playerId) return NextResponse.json({ error: "Missing player" }, { status: 400 });

  const answer = answerPool[Math.floor(Math.random() * answerPool.length)];
  const db = serviceClient();
  const { data: run, error } = await db
    .from("runs")
    .insert({ player_id: playerId, answer_id: answer.id, seen_ids: [answer.id] })
    .select("id,streak")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ runId: run.id, streak: run.streak, guesses: 0 });
}
