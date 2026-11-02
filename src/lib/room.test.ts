import assert from "node:assert/strict";
import test from "node:test";
import { makeCode, roundOver, scoreRound, secondsLeft, standings, type Room } from "./room.ts";

const room = (over: Partial<Room> = {}): Room => ({
  code: "ABCD", host_id: "h", status: "playing", rounds: 5, round_seconds: 90,
  current_round: 1, answer_ids: [1, 2, 3, 4, 5], round_started_at: null, ...over,
});

test("codes avoid characters that get misread aloud", () => {
  for (let i = 0; i < 500; i++) {
    const code = makeCode();
    assert.equal(code.length, 4);
    assert.doesNotMatch(code, /[AEIOU01]/, `ambiguous or vowel in ${code}`);
  }
});

test("scoring rewards solving early and never goes negative", () => {
  assert.equal(scoreRound(true, 1), 100);
  assert.equal(scoreRound(true, 10), 10);
  assert.equal(scoreRound(false, 10), 0);
  // A win on the last guess still has to beat not solving it at all.
  assert.ok(scoreRound(true, 10) > scoreRound(false, 1));
  // Out-of-range guess counts are clamped rather than producing odd scores.
  assert.equal(scoreRound(true, 0), 100);
  assert.equal(scoreRound(true, 99), 10);
});

test("the clock counts down and floors at zero", () => {
  const started = new Date("2026-11-02T12:00:00Z");
  const r = room({ round_started_at: started.toISOString(), round_seconds: 90 });
  assert.equal(secondsLeft(r, started.getTime()), 90);
  assert.equal(secondsLeft(r, started.getTime() + 30_000), 60);
  assert.equal(secondsLeft(r, started.getTime() + 120_000), 0, "must not go negative");
  // A lobby shows the full round length rather than a stale countdown.
  assert.equal(secondsLeft(room({ status: "lobby" })), 90);
});

test("a round ends when everyone answers or the clock expires", () => {
  const started = new Date("2026-11-02T12:00:00Z");
  const r = room({ round_started_at: started.toISOString() });
  const players = [
    { player_id: "a", name: "A", score: 0 },
    { player_id: "b", name: "B", score: 0 },
  ];
  const one = [{ player_id: "a", round: 1, solved: true, guesses: 2, points: 90 }];
  assert.equal(roundOver(r, players, one, started.getTime()), false);
  const both = [...one, { player_id: "b", round: 1, solved: false, guesses: null, points: 0 }];
  assert.equal(roundOver(r, players, both, started.getTime()), true);
  // Still true on time alone, even with nobody having answered.
  assert.equal(roundOver(r, players, [], started.getTime() + 91_000), true);
});

test("standings rank by points, then rounds solved, and share a tie", () => {
  const players = [
    { player_id: "a", name: "Ana", score: 100 },
    { player_id: "b", name: "Bo", score: 180 },
    { player_id: "c", name: "Cy", score: 100 },
  ];
  const results = [
    { player_id: "b", round: 1, solved: true, guesses: 1, points: 100 },
    { player_id: "b", round: 2, solved: true, guesses: 3, points: 80 },
    { player_id: "a", round: 1, solved: true, guesses: 2, points: 100 },
    { player_id: "c", round: 1, solved: true, guesses: 2, points: 100 },
  ];
  const table = standings(players, results);
  assert.deepEqual(table.map((r) => r.name), ["Bo", "Ana", "Cy"]);
  assert.deepEqual(table.map((r) => r.rank), [1, 2, 2], "an exact tie shares a rank");
  assert.equal(table[0].solved, 2);
});
