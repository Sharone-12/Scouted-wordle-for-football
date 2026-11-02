"""Build Scouted's player pool from Sofascore.

Reuses ~/sofascore-scraper for the Cloudflare-beating browser fetch and its
raw-JSON cache, so a re-run costs nothing until the cache is cleared.

    python scripts/fetch_players.py            cached where possible
    python scripts/fetch_players.py --refresh  refetch everything

Output: src/data/players.json

One request per club gives every biographical field (country, DOB, height,
foot, position, market value), which is why this does not hit /player/{id}
once per player: 98 requests instead of ~2500.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

SCRAPER = Path.home() / "sofascore-scraper"
sys.path.insert(0, str(SCRAPER))
import data_loader as dl  # noqa: E402

TOP5 = {
    "Premier League": 17,
    "La Liga": 8,
    "Serie A": 23,
    "Bundesliga": 35,
    "Ligue 1": 34,
}
# Two seasons of league goals/assists: one month into a season, this season's
# totals alone are all zeros and the higher/lower hint would say nothing.
SEASONS = [2025, 2026]
UCL = 7
# src/data/honours.json is hand-written and stops at 2024/25. Everything from
# 2025/26 on is computed below, so the two never double-count.
POSITION = {"G": "GK", "D": "DEF", "M": "MID", "F": "FWD"}

# Geographic continent, keyed by Sofascore's alpha3. The UEFA members that sit
# partly or wholly in Asia (Türkiye, Russia, Armenia, Georgia, Israel) are
# listed as Europe, because that is how a football fan reads them and the
# yellow "same continent" hint is judged by the player, not by an atlas.
CONTINENT = {
    "Europe": """ALB ARM AUT BEL BGR BIH CHE CZE DEU DNK ENG ESP EST FIN FRA GEO
        GRC HRV HUN IRL ISL ISR ITA LTU LUX LVA MKD MNE NIR NLD NOR POL PRT ROU
        RUS SCO SRB SVK SVN SWE TUR UKR WAL XKX""",
    "Africa": """AGO BDI BEN BFA CAF CIV CMR COD COG COM CPV DZA EGY GAB GHA GIN
        GMB GNB GNQ MAR MLI MOZ MRT NER NGA SEN SLE TGO TUN TZA ZMB""",
    "Asia": "CHN IDN JOR JPN KOR MYS PHL SAU THA UZB",
    "South America": "ARG BOL BRA CHL COL ECU GUY PER PRY SUR URY VEN",
    "North America": "CAN CRI DOM GLP HTI JAM MEX MTQ USA",
    "Oceania": "AUS NZL",
}
CONTINENT = {c: k for k, v in CONTINENT.items() for c in v.split()}


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "data" / "players.json"
CACHE = SCRAPER / "data" / "raw"


def get(path: str, tag: str, refresh: bool) -> dict:
    return dl._get(f"{dl.SOFASCORE}/api/v1/{path}", CACHE / f"fw_{tag}.json", refresh)


def league_teams(tournament: int, sid: int, refresh: bool) -> list[dict]:
    d = get(f"unique-tournament/{tournament}/season/{sid}/standings/total",
            f"standings_{tournament}_{sid}", refresh)
    return [r["team"] for group in d["standings"] for r in group["rows"]]


def squad(team: dict, league: str, refresh: bool) -> list[dict]:
    d = get(f"team/{team['id']}/players", f"squad_{team['id']}", refresh)
    out = []
    for entry in d.get("players", []):
        p = entry["player"]
        if p.get("deceased") or p.get("retired"):
            continue
        country = p.get("country") or {}
        out.append({
            "id": p["id"],
            "name": p["name"],
            "slug": p.get("slug", ""),
            "team": team["name"],
            "teamId": team["id"],
            "league": league,
            "country": country.get("name"),
            "countryCode": country.get("alpha3"),
            "continent": CONTINENT.get(country.get("alpha3")),
            "position": POSITION.get(p.get("position"), None),
            "detailedPositions": p.get("positionsDetailed") or [],
            "dateOfBirth": p.get("dateOfBirth"),
            "height": p.get("height"),
            "foot": p.get("preferredFoot"),
            "shirtNumber": p.get("shirtNumber"),
            # How many Sofascore users follow this player: the only direct
            # measure of fame in the data, and a far better answer-pool filter
            # than market value, which rates unknown teenagers highly.
            "followers": p.get("userCount") or 0,
            "marketValue": p.get("proposedMarketValueRaw", {}).get("value")
                           if isinstance(p.get("proposedMarketValueRaw"), dict)
                           else p.get("proposedMarketValue"),
        })
    return out


def season_rows(start: int, leagues: dict, refresh: bool) -> list[dict]:
    df = dl.fetch_player_stats(start, leagues, refresh)
    return [] if df.empty else df.to_dict("records")


def champions(start: int, refresh: bool) -> tuple[dict[str, str], str | None]:
    """(league -> champion club) for finished seasons, plus the UCL winner."""
    league_champs: dict[str, str] = {}
    for league, tournament in TOP5.items():
        sid = dl.get_season_ids(tournament, refresh).get(start)
        if sid is None:
            continue
        rows = [r for g in get(f"unique-tournament/{tournament}/season/{sid}/standings/total",
                               f"standings_{tournament}_{sid}", refresh)["standings"]
                for r in g["rows"]]
        top = rows[0]
        if (top.get("matches") or 0) >= (len(rows) - 1) * 2:   # season complete
            league_champs[league] = top["team"]["name"]

    ucl_winner = None
    sid = dl.get_season_ids(UCL, refresh).get(start)
    if sid is not None:
        events = get(f"unique-tournament/{UCL}/season/{sid}/events/last/0",
                     f"ucl_last_{sid}", refresh).get("events", [])
        for e in events:
            if e.get("roundInfo", {}).get("slug") == "final" and e.get("winnerCode") in (1, 2):
                ucl_winner = e["homeTeam" if e["winnerCode"] == 1 else "awayTeam"]["name"]
    return league_champs, ucl_winner


def computed_titles(refresh: bool) -> dict[int, dict]:
    """Titles won in the scraped seasons, which the hand file deliberately omits.

    A player counts as a winner if they logged any minutes for the champion in
    that competition that season.
    # ponytail: a one-minute cameo earns a title here, where a real medal needs
    # a minimum of appearances. Tighten the minutes floor if it bothers anyone.
    """
    out: dict[int, dict] = {}
    for start in SEASONS:
        champs, ucl_winner = champions(start, refresh)
        if champs:
            for r in season_rows(start, {n: {"tournament": t} for n, t in TOP5.items()}, refresh):
                if champs.get(r["league"]) == r["team"] and (r["minutes"] or 0) > 0:
                    out.setdefault(int(r["player_id"]), {"ucl": 0, "league": 0})["league"] += 1
        if ucl_winner:
            for r in season_rows(start, {"Champions League": {"tournament": UCL}}, refresh):
                if r["team"] == ucl_winner and (r["minutes"] or 0) > 0:
                    out.setdefault(int(r["player_id"]), {"ucl": 0, "league": 0})["ucl"] += 1
        print(f"  {dl.season_label(start)} champions: {champs or 'season in progress'}"
              f" | UCL: {ucl_winner or 'not decided'}")
    return out


def season_stats(refresh: bool) -> dict[int, dict]:
    """player_id -> summed league goals/assists/minutes/appearances."""
    totals: dict[int, dict] = {}
    leagues = {name: {"tournament": t} for name, t in TOP5.items()}
    for start in SEASONS:
        for r in season_rows(start, leagues, refresh):
            t = totals.setdefault(int(r["player_id"]),
                                  {"goals": 0, "assists": 0, "minutes": 0, "appearances": 0})
            for k in t:
                t[k] += int(r.get(k) or 0)
    return totals


def main() -> None:
    refresh = "--refresh" in sys.argv
    start = dl.current_season()

    players: dict[int, dict] = {}
    for league, tournament in TOP5.items():
        sid = dl.get_season_ids(tournament, refresh).get(start)
        if sid is None:
            print(f"  no {dl.season_label(start)} season for {league}")
            continue
        teams = league_teams(tournament, sid, refresh)
        print(f"{league}: {len(teams)} clubs")
        for team in teams:
            for p in squad(team, league, refresh):
                players.setdefault(p["id"], p)   # first club wins (loanees)
        print(f"  {league}: {len(players)} players so far")

    # Two sets of numbers, named so they can never be confused: career* is what
    # the game compares with its higher/lower hint, recent* is only there to
    # judge how well known a player is when picking the answer pool.
    zero = {"goals": 0, "assists": 0, "minutes": 0, "appearances": 0}
    stats = season_stats(refresh)
    career_file = ROOT / "src" / "data" / "career.json"
    career = json.loads(career_file.read_text(encoding="utf-8")) if career_file.exists() else {}
    if not career:
        print("WARNING: no src/data/career.json, career totals are all zero."
              " Run scripts/fetch_career.py first.")
    for pid, p in players.items():
        recent = stats.get(pid, zero)
        tot = career.get(str(pid), zero)
        p["careerGoals"] = tot["goals"]
        p["careerAssists"] = tot["assists"]
        p["careerApps"] = tot["appearances"]
        p["careerMinutes"] = tot["minutes"]
        p["recentGoals"] = recent["goals"]
        p["recentAssists"] = recent["assists"]
        p["recentMinutes"] = recent["minutes"]

    hand = json.loads((ROOT / "src" / "data" / "honours.json").read_text(encoding="utf-8"))
    by_name = hand["players"]
    # Two squad players can share a name (PSG's Vitinha and Genoa's Vitinha), and
    # a bare name would hand one player's medals to the other. Such a name only
    # resolves in its "Name|Club" form.
    ambiguous = {n for n in (p["name"] for p in players.values())
                 if sum(1 for q in players.values() if q["name"] == n) > 1}
    unresolved = [k for k in by_name
                  if "|" not in k and k in ambiguous]
    unknown = [k for k in by_name if "|" not in k and k not in
               {p["name"] for p in players.values()}] + \
              [k for k in by_name if "|" in k and k not in
               {f"{p['name']}|{p['team']}" for p in players.values()}]
    if unresolved:
        print("HONOURS NOT APPLIED, name is ambiguous, qualify it as 'Name|Club':", unresolved)
    if unknown:
        print("HONOURS NOT APPLIED, no such player in the pool:", unknown)

    earned = computed_titles(refresh)
    for p in players.values():
        key = f"{p['name']}|{p['team']}"
        ucl, league = by_name.get(key) or (
            [0, 0] if p["name"] in ambiguous else by_name.get(p["name"], [0, 0]))
        got = earned.get(p["id"], {})
        p["uclTitles"] = ucl + got.get("ucl", 0)
        p["leagueTitles"] = league + got.get("league", 0)

    rows = sorted(players.values(), key=lambda p: (-(p["recentMinutes"] or 0), p["name"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {len(rows)} players to {OUT.relative_to(ROOT)}")
    print("with recent minutes:", sum(1 for r in rows if r["recentMinutes"]))
    print("with career goals:", sum(1 for r in rows if r["careerGoals"]))
    print("missing country:", sum(1 for r in rows if not r["country"]))
    print("with a title:", sum(1 for r in rows if r["uclTitles"] or r["leagueTitles"]))
    unmapped = sorted({(r["countryCode"], r["country"]) for r in rows
                       if r["country"] and not r["continent"]})
    if unmapped:
        print("NO CONTINENT for:", unmapped)


if __name__ == "__main__":
    main()
