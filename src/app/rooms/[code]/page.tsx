import { notFound } from "next/navigation";
import { Suspense } from "react";
import data from "@/data/game-players.json";
import { RoomGame } from "@/components/room-game";
import { Loading } from "@/components/loading";
import type { Player } from "@/lib/game";

const players = data as Player[];

async function Room({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[A-Za-z0-9]{4}$/.test(code)) notFound();
  return <RoomGame code={code.toUpperCase()} players={players} />;
}

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  // Reading `params` is request-time work, so the shell prerenders and the
  // room streams in behind this boundary.
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-3xl px-4 py-14">
          <Loading label="Loading room…" />
        </main>
      }
    >
      <Room params={params} />
    </Suspense>
  );
}
