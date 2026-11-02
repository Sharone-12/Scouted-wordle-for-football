import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase-server";


export async function GET() {
  const db = serviceClient();
  const { data, error } = await db
    .from("leaderboard")
    .select("name,streak,created_at")
    .order("streak", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data ?? [] });
}

/**
 * Submitting is deliberately not possible here.
 *
 * This endpoint used to take {name, streak} straight from the client, which
 * meant a one-line curl could post any number. A streak now only reaches the
 * board through POST /api/runs/[id] with action "claim", where the figure
 * written is the one the server counted while judging the guesses.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Streaks are posted from a finished run, not submitted directly" },
    { status: 405 },
  );
}
