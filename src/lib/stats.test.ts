import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY, recordDaily, recordUnlimited, winRate } from "./stats.ts";

test("an unlimited streak grows on wins and dies on a loss", () => {
  let s = EMPTY;
  for (let i = 0; i < 4; i++) s = recordUnlimited(s, true);
  assert.equal(s.unlimited.current, 4);
  assert.equal(s.unlimited.best, 4);
  s = recordUnlimited(s, false);
  assert.equal(s.unlimited.current, 0);
  assert.equal(s.unlimited.best, 4, "best must survive a loss");
  assert.equal(s.unlimited.played, 5);
  assert.equal(s.unlimited.won, 4);
});

test("a daily streak needs consecutive puzzles", () => {
  let s = recordDaily(EMPTY, 10, true, 3);
  s = recordDaily(s, 11, true, 5);
  assert.equal(s.daily.current, 2);
  // Puzzle 13 skips 12, so the streak restarts at one rather than continuing.
  s = recordDaily(s, 13, true, 4);
  assert.equal(s.daily.current, 1);
  assert.equal(s.daily.best, 2);
});

test("replaying a recorded puzzle changes nothing", () => {
  const once = recordDaily(EMPTY, 7, true, 2);
  assert.deepEqual(recordDaily(once, 7, true, 2), once);
  assert.deepEqual(recordDaily(once, 6, false, 10), once, "an older puzzle must not count");
});

test("losing the daily resets the streak but still counts as played", () => {
  let s = recordDaily(EMPTY, 1, true, 4);
  s = recordDaily(s, 2, false, 10);
  assert.equal(s.daily.current, 0);
  assert.equal(s.daily.played, 2);
  assert.equal(s.daily.won, 1);
  assert.deepEqual(
    s.daily.distribution.filter((n) => n),
    [1],
    "a loss must not land in the guess distribution",
  );
});

test("the distribution records the guess a win took", () => {
  let s = recordDaily(EMPTY, 1, true, 3);
  s = recordDaily(s, 2, true, 3);
  s = recordDaily(s, 3, true, 1);
  assert.equal(s.daily.distribution[2], 2);
  assert.equal(s.daily.distribution[0], 1);
});

test("win rate is a whole percentage and safe at zero games", () => {
  assert.equal(winRate(EMPTY.unlimited), 0);
  assert.equal(winRate({ played: 3, won: 1, current: 0, best: 0 }), 33);
});
