import { NextResponse } from "next/server";
import data from "@/data/game-players.json";
import type { Player } from "@/lib/game";
import { makeCode, ROUND_CHOICES, SECONDS_CHOICES } from "@/lib/room";
import { serviceClient } from "@/lib/supabase-server";

const answerPool = (data as Player[]).filter((p) => p.answer);

const pick = <T,>(list: readonly T[], value: unknown, fallback: T): T =>
  list.includes(value as T) ? (value as T) : fallback;

/** Create a room. The answers for every round are fixed now, so each player
 *  in the room is shown the same sequence. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const hostId = String(body.hostId ?? "").slice(0, 64);
  const name = String(body.name ?? "").trim().slice(0, 24);
  if (!hostId || !name) {
    return NextResponse.json({ error: "A name is required" }, { status: 400 });
  }

  const rounds = pick(ROUND_CHOICES, Number(body.rounds), 5);
  const roundSeconds = pick(SECONDS_CHOICES, Number(body.roundSeconds), 90);

  const shuffled = answerPool.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const answerIds = shuffled.slice(0, rounds).map((p) => p.id);

  const db = serviceClient();
  // A four-character code collides eventually; retry rather than hand the
  // player an error, and give up rather than loop forever.
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = makeCode();
    const { error } = await db.from("rooms").insert({
      code,
      host_id: hostId,
      rounds,
      round_seconds: roundSeconds,
      answer_ids: answerIds,
    });
    if (!error) {
      await db.from("room_players").insert({ room_code: code, player_id: hostId, name });
      return NextResponse.json({ code });
    }
    if (error.code !== "23505") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "Could not allocate a room code" }, { status: 503 });
}
