import { NextResponse } from "next/server";
import { roundOver, scoreRound, type Room, type RoomPlayer, type RoomResult } from "@/lib/room";
import { serviceClient } from "@/lib/supabase-server";

type Ctx = { params: Promise<{ code: string }> };

async function load(code: string) {
  const db = serviceClient();
  const [room, players, results] = await Promise.all([
    db.from("rooms").select("*").eq("code", code).maybeSingle(),
    db.from("room_players").select("player_id,name,score").eq("room_code", code).order("joined_at"),
    db.from("room_results").select("player_id,round,solved,guesses,points").eq("room_code", code),
  ]);
  return {
    db,
    room: room.data as Room | null,
    players: (players.data ?? []) as RoomPlayer[],
    results: (results.data ?? []) as RoomResult[],
  };
}

export async function GET(_request: Request, { params }: Ctx) {
  const { code } = await params;
  const { room, players, results } = await load(code.toUpperCase());
  if (!room) return NextResponse.json({ error: "No such room" }, { status: 404 });
  return NextResponse.json({ room, players, results });
}

/**
 * Every mutation a player can make, behind one handler.
 *
 * The client never writes to the tables directly: the anon key is public, so
 * a player could otherwise set their own score. Points are computed here from
 * the guess count, and a result can only be written once per round.
 */
export async function POST(request: Request, { params }: Ctx) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const playerId = String(body.playerId ?? "").slice(0, 64);
  if (!playerId) return NextResponse.json({ error: "Missing player" }, { status: 400 });

  const { db, room, players, results } = await load(code);
  if (!room) return NextResponse.json({ error: "No such room" }, { status: 404 });

  if (action === "join") {
    if (room.status !== "lobby") {
      return NextResponse.json({ error: "That game has already started" }, { status: 409 });
    }
    const name = String(body.name ?? "").trim().slice(0, 24);
    if (!name) return NextResponse.json({ error: "A name is required" }, { status: 400 });
    const { error } = await db
      .from("room_players")
      .upsert({ room_code: code, player_id: playerId, name }, { onConflict: "room_code,player_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "start") {
    if (playerId !== room.host_id) {
      return NextResponse.json({ error: "Only the host can start" }, { status: 403 });
    }
    if (room.status !== "lobby") return NextResponse.json({ ok: true });
    await db
      .from("rooms")
      .update({ status: "playing", current_round: 1, round_started_at: new Date().toISOString() })
      .eq("code", code);
    return NextResponse.json({ ok: true });
  }

  if (action === "result") {
    if (room.status !== "playing") {
      return NextResponse.json({ error: "Not playing" }, { status: 409 });
    }
    const solved = Boolean(body.solved);
    const guesses = Number(body.guesses) || 0;
    const points = scoreRound(solved, guesses);
    // ignoreDuplicates: a resubmitted round keeps its first score rather than
    // letting a player replay for a better one.
    const { error } = await db.from("room_results").upsert(
      {
        room_code: code,
        player_id: playerId,
        round: room.current_round,
        solved,
        guesses: solved ? guesses : null,
        points,
      },
      { onConflict: "room_code,player_id,round", ignoreDuplicates: true },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const fresh = await db
      .from("room_results")
      .select("round,points")
      .eq("room_code", code)
      .eq("player_id", playerId);
    const rows = fresh.data ?? [];
    const total = rows.reduce((sum, r) => sum + (r.points ?? 0), 0);
    await db
      .from("room_players")
      .update({ score: total })
      .eq("room_code", code)
      .eq("player_id", playerId);
    // Report what is stored, not what this call computed: a resubmitted round
    // keeps its original score, and saying otherwise would be a lie.
    const stored = rows.find((r) => r.round === room.current_round)?.points ?? points;
    return NextResponse.json({ ok: true, points: stored, total });
  }

  if (action === "next") {
    if (room.status !== "playing") return NextResponse.json({ ok: true });
    // Any client may ask to advance, but only when the round is genuinely
    // finished — otherwise one player could cut the round short for everyone.
    if (!roundOver(room, players, results)) {
      return NextResponse.json({ ok: false, reason: "round in progress" });
    }
    const next = room.current_round + 1;
    await db
      .from("rooms")
      .update(
        next > room.rounds
          ? { status: "done", round_started_at: null }
          : { current_round: next, round_started_at: new Date().toISOString() },
      )
      .eq("code", code);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
