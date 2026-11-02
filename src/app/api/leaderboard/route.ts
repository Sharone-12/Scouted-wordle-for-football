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

/** Submit an unlimited-mode streak. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 24);
  const streak = Math.floor(Number(body.streak));
  // The streak is kept client-side, so this is self-reported by nature. The
  // bounds only stop absurd values from wrecking the table; a real guard
  // would mean running unlimited rounds server-side too.
  if (!name) return NextResponse.json({ error: "A name is required" }, { status: 400 });
  if (!Number.isFinite(streak) || streak < 1 || streak > 10_000) {
    return NextResponse.json({ error: "Invalid streak" }, { status: 400 });
  }
  const db = serviceClient();

  // One row per player, holding their best run. Inserting every submission
  // would let one person repeat-post their way across the whole top 20, and a
  // later worse run must not replace a better one already on the board.
  const existing = await db
    .from("leaderboard")
    .select("id,streak")
    .ilike("name", name)
    .maybeSingle();

  if (existing.data) {
    if (existing.data.streak >= streak) {
      return NextResponse.json({ ok: true, best: existing.data.streak, changed: false });
    }
    const { error } = await db
      .from("leaderboard")
      .update({ name, streak, created_at: new Date().toISOString() })
      .eq("id", existing.data.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, best: streak, changed: true });
  }

  const { error } = await db.from("leaderboard").insert({ name, streak });
  // 23505 means another request inserted the same name a moment ago; their
  // row is already there, so this is not a failure worth showing anyone.
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, best: streak, changed: true });
}
