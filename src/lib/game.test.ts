import assert from "node:assert/strict";
import test from "node:test";
import {
  answerFor,
  compare,
  EPOCH,
  puzzleNumber,
  randomAnswer,
  search,
  type Player,
} from "./game.ts";

const p = (over: Partial<Player>): Player => ({
  id: 1, name: "X", team: "Arsenal", teamId: 42, league: "Premier League", leagueId: 17, country: "England",
  continent: "Europe", role: "ST", goals: 100, assists: 30, ucl: 1, titles: 2,
  followers: 0, answer: true, ...over,
});

const cells = (g: Player, t: Player) => Object.fromEntries(compare(g, t).map((c) => [c.key, c]));

test("exact match is all hits", () => {
  const target = p({ id: 2 });
  for (const c of compare(p({ id: 2 }), target)) assert.equal(c.state, "hit", c.key);
});

test("club is close when only the league matches", () => {
  const c = cells(p({ team: "Chelsea" }), p({ team: "Arsenal" }));
  assert.equal(c.team.state, "close");
  assert.equal(c.league.state, "hit");
});

test("country is close within the same continent, miss across it", () => {
  assert.equal(cells(p({ country: "Spain" }), p({ country: "England" })).country.state, "close");
  const away = p({ country: "Brazil", continent: "South America" });
  assert.equal(cells(away, p({})).country.state, "miss");
});

test("position is close within the same line", () => {
  assert.equal(cells(p({ role: "W" }), p({ role: "ST" })).role.state, "close");
  assert.equal(cells(p({ role: "CB" }), p({ role: "ST" })).role.state, "miss");
  assert.equal(cells(p({ role: "GK" }), p({ role: "CB" })).role.state, "miss");
});

test("titles need an exact match and point the right way", () => {
  const c = cells(p({ ucl: 0 }), p({ ucl: 2 }));
  assert.equal(c.ucl.state, "miss");
  assert.equal(c.ucl.dir, "up");
  assert.equal(cells(p({ titles: 5 }), p({ titles: 2 })).titles.dir, "down");
  assert.equal(cells(p({ ucl: 0 }), p({ ucl: 0 })).ucl.state, "hit");
});

test("career goals hit inside a band that scales with the total", () => {
  // 10% of 373 is 37, so 350 is close enough to read as a hit.
  assert.equal(cells(p({ goals: 350 }), p({ goals: 373 })).goals.state, "hit");
  assert.equal(cells(p({ goals: 200 }), p({ goals: 373 })).goals.dir, "up");
  assert.equal(cells(p({ goals: 373 }), p({ goals: 373 })).goals.state, "hit");
});

test("small totals need the exact number, not a band", () => {
  // Reported from a real board: 0 assists and 2 assists both came back green.
  const target = p({ assists: 1 });
  assert.equal(cells(p({ assists: 0 }), target).assists.state, "miss");
  assert.equal(cells(p({ assists: 2 }), target).assists.state, "miss");
  assert.equal(cells(p({ assists: 1 }), target).assists.state, "hit");
  // Below ten, exactly one guess may be green: the right one.
  for (const t of [0, 1, 2, 5, 9, 40, 373]) {
    const greens = Array.from({ length: t + 60 }, (_, g) => g).filter(
      (g) => cells(p({ goals: g }), p({ goals: t })).goals.state === "hit",
    );
    assert.ok(greens.includes(t), `target ${t} is not green against itself`);
    if (t < 10) assert.deepEqual(greens, [t], `target ${t} has several green answers`);
  }
});

test("the answer is the same for everyone all day, whatever the clock", () => {
  const pool = Array.from({ length: 221 }, (_, i) => p({ id: i, name: `P${i}` }));
  const early = answerFor(pool, new Date("2026-11-05T00:00:01Z"));
  const late = answerFor(pool, new Date("2026-11-05T23:59:59Z"));
  assert.equal(early.id, late.id);
  // Two players in different time zones hit the same UTC day, so same answer.
  assert.equal(answerFor(pool, new Date("2026-11-05T12:00:00+13:00")).id,
               answerFor(pool, new Date("2026-11-04T23:00:00Z")).id);
});

test("puzzle numbers count up one per day from the epoch", () => {
  assert.equal(puzzleNumber(new Date(EPOCH)), 1);
  assert.equal(puzzleNumber(new Date(EPOCH + 86_400_000)), 2);
  assert.equal(puzzleNumber(new Date(EPOCH + 86_400_000 * 364)), 365);
});

test("no player repeats until the whole pool has been used", () => {
  const size = 221;
  const pool = Array.from({ length: size }, (_, i) => p({ id: i, name: `P${i}` }));
  const cycle = Array.from({ length: size }, (_, i) =>
    answerFor(pool, new Date(EPOCH + i * 86_400_000)).id,
  );
  assert.equal(new Set(cycle).size, size, "a player came round twice inside one cycle");
  // The next cycle is dealt in a different order, not the same list again.
  const next = Array.from({ length: 20 }, (_, i) =>
    answerFor(pool, new Date(EPOCH + (size + i) * 86_400_000)).id,
  );
  assert.notDeepEqual(next, cycle.slice(0, 20));
});

test("consecutive days are not adjacent in the pool", () => {
  const pool = Array.from({ length: 221 }, (_, i) => p({ id: i, name: `P${i}` }));
  const ids = Array.from({ length: 14 }, (_, i) =>
    answerFor(pool, new Date(EPOCH + i * 86_400_000)).id,
  );
  const steps = ids.slice(1).map((id, i) => Math.abs(id - ids[i]));
  assert.ok(steps.filter((s) => s <= 1).length <= 1, `walks in order: ${ids.join(",")}`);
});

test("amber cells explain the rule without naming the answer", () => {
  const target = p({ team: "Arsenal", country: "England", role: "ST" });
  const c = cells(p({ team: "Chelsea", country: "Spain", role: "W" }), target);
  assert.match(c.team.note!, /Right league, wrong club/);
  assert.match(c.country.note!, /Right continent/);
  assert.match(c.role.note!, /attack/);
  // A note must never leak the target's own value.
  for (const cell of Object.values(c)) {
    if (!cell.note) continue;
    for (const secret of [target.team, target.country, "Striker"])
      assert.ok(!cell.note.includes(secret), `${cell.key} note leaks "${secret}"`);
  }
});

test("only amber cells carry a note", () => {
  const target = p({ id: 9 });
  for (const cell of compare(p({ id: 9 }), target)) assert.equal(cell.note, undefined);
  const miss = cells(p({ country: "Brazil", continent: "South America" }), target);
  assert.equal(miss.country.note, undefined);
});

test("unlimited never serves the same player twice in a row", () => {
  const pool = Array.from({ length: 5 }, (_, i) => p({ id: i, name: `P${i}` }));
  const last = pool[2];
  for (let i = 0; i < 200; i++) assert.notEqual(randomAnswer(pool, last).id, last.id);
  // A single-player pool must still return someone rather than undefined.
  assert.equal(randomAnswer([last], last).id, last.id);
});

test("unlimited draws from the whole pool, not one corner of it", () => {
  const pool = Array.from({ length: 20 }, (_, i) => p({ id: i, name: `P${i}` }));
  const seen = new Set(Array.from({ length: 400 }, () => randomAnswer(pool).id));
  assert.ok(seen.size >= 18, `only hit ${seen.size} of 20`);
});

test("search prefers names that start with the query", () => {
  const pool = [p({ id: 1, name: "Bukayo Saka" }), p({ id: 2, name: "Sakariya" })];
  assert.equal(search(pool, "sak")[0].name, "Sakariya");
  assert.deepEqual(search(pool, ""), []);
});

test("search ignores accents in both the query and the name", () => {
  const pool = [p({ id: 1, name: "Luka Modrić" }), p({ id: 2, name: "Julián Alvarez" })];
  assert.equal(search(pool, "modric")[0]?.name, "Luka Modrić");
  assert.equal(search(pool, "julian")[0]?.name, "Julián Alvarez");
  assert.equal(search(pool, "Modrić")[0]?.name, "Luka Modrić");
});

test("the best-known match comes first", () => {
  const pool = [
    p({ id: 1, name: "Thiago Pitarch", followers: 900 }),
    p({ id: 2, name: "Thiago Alcantara", followers: 400_000 }),
    p({ id: 3, name: "Thiago Silva", followers: 250_000 }),
  ];
  assert.deepEqual(
    search(pool, "thiago").map((x) => x.id),
    [2, 3, 1],
  );
});
