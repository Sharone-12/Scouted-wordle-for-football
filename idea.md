# Scouted — idea

*Wordle for football.* (Working title was footwordle.)

Wordle, but for football players. Guess the mystery player in **10 tries**.

Each guess is a real player. Instead of letters lighting up, the player's
**attributes** light up — green if it matches the target, yellow if it's close,
grey if it's wrong.

## Attributes shown per guess

| Attribute | Green | Yellow | Grey |
|---|---|---|---|
| Position (GK / DEF / MID / WING / ST) | exact same position | same broad line (e.g. winger vs striker both attack) | different |
| Country | same country | same continent | different |
| League | same league | same country's league system / same tier elsewhere | different |
| Club | same club | — | different |
| UCL titles | same count | — | different (+ ↑/↓ hint) |
| League titles | same count | — | different (+ ↑/↓ hint) |
| Career goals | same bucket | — | different (+ ↑/↓ hint) |
| Career assists | same bucket | — | different (+ ↑/↓ hint) |

## Numeric attributes get a direction hint

For counts (goals, assists, UCLs, league titles) show **↑ / ↓** (or > / <)
comparing the guessed player to the target: ↑ means the target has more.
So a wrong number still narrows the search instead of just going grey.

## Open questions

- Exact yellow rule for position — strict line (ATT/MID/DEF/GK) or adjacency?
- Numbers: exact match only, or a tolerance band (±2 goals still green)?
- Player pool size and how it's sourced.

## Data

Source: `~/sofascore-scraper` (own repo, Playwright/botasaurus browser fetch past
Cloudflare, caches raw JSON). Builder: `scripts/fetch_players.py` →
`src/data/players.json`.

Pool: every squad player at all **top-5 league** clubs (PL, La Liga, Serie A,
Bundesliga, Ligue 1 — 98 clubs), so Bayern and PSG come included rather than
special-cased.

One request per club returns every bio field, which is what keeps the whole
build ~150 requests instead of ~2500.

### Available per player

club, league, country (+ alpha3), position (GK/DEF/MID/FWD), detailed positions
(ST, LW, DM…), date of birth, height, preferred foot, shirt number, market value.

Two separate sets of numbers, named so they can't be confused:

- **`careerGoals` / `careerAssists` / `careerApps` / `careerMinutes`** — career
  totals, and what the game's higher/lower hint compares. Scope: top-5 European
  leagues + Champions League, 2008/09 onward (`scripts/fetch_career.py`). Goals
  in the Eredivisie, the Championship, Brazil or a domestic cup are not counted,
  so the number means the same thing for every player.
- **`recentGoals` / `recentAssists` / `recentMinutes`** — 2025/26 + 2026/27
  league only. Not for comparing; it's there to judge how well known a player is
  when picking the answer pool.

Career totals come from sweeping each league-season's bulk endpoint, not from
asking per player: Kane alone has 70 competition-seasons, so per-player would be
~16 hours against ~1 hour for the whole pool this way.

### Titles: curated + computed

Sofascore has no honours endpoint (`/player/{id}/trophies` 404s for every
player), so titles come from two places that are kept strictly apart:

- `src/data/honours.json` — hand-written, **up to and including 2024/25**, 157
  players, `name: [uclTitles, leagueTitles]`. Anyone absent is 0.
  `league` counts top-5-European-league titles only, so the number means the
  same thing for everyone. A name two players share must be written
  `Name|Club`, or the build refuses to apply it and says so.
- Computed by `scripts/fetch_players.py` for every **scraped** season, from the
  final standings and the UCL final: 2025/26 went Arsenal (PL), Barcelona (La
  Liga), Inter (Serie A), Bayern (Bundesliga), PSG (Ligue 1), and PSG beat
  Arsenal on penalties for the UCL. Any player with minutes for a champion gets
  the title. 2026/27 is still in progress and awards nothing.

So the hand file never needs touching again for a new season — only for a
player whose pre-2025 honours are missing.

The first pass of the hand file was ranked by market value, which skews young
and read Modrić, Courtois, Alaba and Bernardo Silva as having won nothing. It
now covers the decorated veterans too. 164 players with 250+ career
appearances are still uncurated, but spot-checking the longest-serving of them
(Aubameyang, Leno, Aspas, Ginter, de Roon) they genuinely have no top-5 league
or UCL title, so the remaining tail is mostly correctly zero.

**These counts are recall, not scraped.** Worth spot-checking before launch.

### Re-running

    ~/sofascore-scraper/.venv/bin/python scripts/fetch_players.py

Raw JSON is cached in `~/sofascore-scraper/data/raw`, so a re-run is free;
`--refresh` refetches. The venv exists because the scraper needs `botasaurus`,
which is missing from its own `requirements.txt`.

## Current pool

2895 players, 96 clubs, 108 countries, 2381 with recent minutes on the clock.
1685 have a career goal, 238 have at least one title, one is missing a country.
Checked: no player has career < recent goals, and nobody with recent goals has
a zero career total, so the join holds.

Career scope shows up in the obvious places — Haaland reads 244 (no Salzburg),
Gyökeres 25 (no Sporting, no Coventry). If that's too lossy the fix is adding
more league ids to `TOURNAMENTS` in `scripts/fetch_career.py` and re-running;
it's ~9 requests per league-season.
Fields: club, league, country + continent, position, detailed positions, DOB,
height, foot, shirt number, market value, careerGoals / careerAssists /
careerApps / careerMinutes, recentGoals / recentAssists / recentMinutes,
uclTitles, leagueTitles.

2895 is too many for a fair game — most are squad filler nobody can name. Use
`recentMinutes` or `marketValue` to tier the answer pool, and keep the full list
guessable.
