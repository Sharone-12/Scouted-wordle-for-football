"""Compute every player's trophies from results, instead of trusting recall.

Winners come from the source: a league title from the final standings, a cup
from the winner of the final. Squads come from each competition-season's bulk
player stats, which is also what `fetch_career.py` sweeps, so the five leagues
and the Champions League are already cached and cost nothing here.

Two competitions have no tournament-wide player stats on Sofascore (too many
lower-league clubs enter them): the FA Cup and the Coupe de France. For those
the squad is taken from the final's lineups, so a player who was rotated
through the earlier rounds but missed the final does not get the trophy. Every
other competition counts anyone who appeared in it that season.

    python scripts/fetch_trophies.py            resume from cache
    python scripts/fetch_trophies.py --refresh  refetch

Output: src/data/trophies.json
  {player_id: {leagueTitles, uclTitles, europeanCups, domesticCups,
               leagueCups, superCups}}
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

SCRAPER = Path.home() / "sofascore-scraper"
sys.path.insert(0, str(SCRAPER))
import data_loader as dl  # noqa: E402

FIRST_SEASON = 2008
FIELDS = "goals,assists,appearances,minutesPlayed"

# (name, tournament id, bucket, squad source)
COMPETITIONS = [
    ("Premier League", 17, "leagueTitles", "standings"),
    ("La Liga", 8, "leagueTitles", "standings"),
    ("Serie A", 23, "leagueTitles", "standings"),
    ("Bundesliga", 35, "leagueTitles", "standings"),
    ("Ligue 1", 34, "leagueTitles", "standings"),
    ("Champions League", 7, "uclTitles", "stats"),
    ("Europa League", 679, "europeanCups", "stats"),
    ("Conference League", 17015, "europeanCups", "stats"),
    ("Copa del Rey", 329, "domesticCups", "stats"),
    ("Coppa Italia", 328, "domesticCups", "stats"),
    ("DFB Pokal", 217, "domesticCups", "stats"),
    ("FA Cup", 19, "domesticCups", "final-lineup"),
    ("Coupe de France", 335, "domesticCups", "final-lineup"),
    ("EFL Cup", 21, "leagueCups", "stats"),
    ("Community Shield", 346, "superCups", "stats"),
    ("Supercopa de España", 213, "superCups", "stats"),
    ("Supercoppa Italiana", 341, "superCups", "stats"),
    ("Franz Beckenbauer Supercup", 799, "superCups", "stats"),
    ("Trophée des Champions", 339, "superCups", "stats"),
    ("UEFA Super Cup", 465, "superCups", "stats"),
]
BUCKETS = ["leagueTitles", "uclTitles", "europeanCups",
           "domesticCups", "leagueCups", "superCups"]

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "data" / "trophies.json"
CACHE = SCRAPER / "data" / "raw"


def get(path: str, tag: str, refresh: bool) -> dict:
    return dl._get(f"{dl.SOFASCORE}/api/v1/{path}", CACHE / f"{tag}.json", refresh)


def league_champion(tournament: int, sid: int, refresh: bool) -> str | None:
    d = get(f"unique-tournament/{tournament}/season/{sid}/standings/total",
            f"fw_standings_{tournament}_{sid}", refresh)
    rows = [r for g in d["standings"] for r in g["rows"]]
    if not rows:
        return None
    # Only a finished season has a champion: every club has played everyone twice.
    return rows[0]["team"]["name"] if (rows[0].get("matches") or 0) >= (len(rows) - 1) * 2 else None


def final_event(tournament: int, sid: int, refresh: bool) -> dict | None:
    """The deciding match of a knockout competition, if it has been played.

    The match must actually be the final. Taking the latest finished match with
    a winner instead awards the trophy to whoever won a group game in a season
    still being played — that handed Real Madrid the 2026/27 Champions League.
    A super cup is a single match and carries no round info, so it is only
    accepted when it is the competition's only fixture that season.
    """
    events = get(f"unique-tournament/{tournament}/season/{sid}/events/last/0",
                 f"fw_last_{tournament}_{sid}", refresh).get("events", [])
    finished = [e for e in events
                if e.get("winnerCode") in (1, 2)
                and (e.get("status") or {}).get("type") == "finished"]
    for e in reversed(finished):
        info = e.get("roundInfo") or {}
        if info.get("slug") == "final" or info.get("name") == "Final":
            return e
    if len(events) == 1 and finished:
        return finished[0]
    return None


def winner_name(e: dict) -> str:
    return e["homeTeam" if e["winnerCode"] == 1 else "awayTeam"]["name"]


def stats_squad(tournament: int, sid: int, team: str, refresh: bool) -> set[int]:
    """Everyone who appeared for `team` in this competition-season."""
    out: set[int] = set()
    for code in dl.POSITIONS:
        page = 0
        while True:
            url = (f"{dl.SOFASCORE}/api/v1/unique-tournament/{tournament}/season/{sid}"
                   f"/statistics?limit=100&offset={page * 100}&order=-minutesPlayed"
                   f"&accumulation=total&fields={FIELDS}&filters=position.in.{code}")
            d = dl._get(url, CACHE / f"car_{tournament}_{sid}_{code}_{page}.json", refresh)
            for r in d.get("results", []):
                if r["team"]["name"] == team and (r.get("appearances") or 0) > 0:
                    out.add(int(r["player"]["id"]))
            page += 1
            if page >= (d.get("pages") or 1):
                break
    return out


def lineup_squad(event: dict, refresh: bool) -> set[int]:
    side = "home" if event["winnerCode"] == 1 else "away"
    d = get(f"event/{event['id']}/lineups", f"fw_lineup_{event['id']}", refresh)
    return {int(p["player"]["id"]) for p in d.get(side, {}).get("players", [])}


def main() -> None:
    refresh = "--refresh" in sys.argv
    last = dl.current_season()
    tally: dict[int, dict] = {}

    def award(pids: set[int], bucket: str) -> None:
        for pid in pids:
            tally.setdefault(pid, dict.fromkeys(BUCKETS, 0))[bucket] += 1

    for name, tournament, bucket, source in COMPETITIONS:
        try:
            seasons = {y: s for y, s in dl.get_season_ids(tournament, refresh).items()
                       if FIRST_SEASON <= y <= last}
        except RuntimeError as e:
            print(f"SKIPPED {name}: {e}")
            continue
        won = 0
        for year in sorted(seasons):
            sid = seasons[year]
            try:
                if source == "standings":
                    champ = league_champion(tournament, sid, refresh)
                    squad = stats_squad(tournament, sid, champ, refresh) if champ else set()
                else:
                    e = final_event(tournament, sid, refresh)
                    if not e:
                        continue
                    champ = winner_name(e)
                    squad = (lineup_squad(e, refresh) if source == "final-lineup"
                             else stats_squad(tournament, sid, champ, refresh))
            except RuntimeError as err:
                print(f"  SKIPPED {name} {dl.season_label(year)}: {err}")
                continue
            if champ and squad:
                award(squad, bucket)
                won += 1
                print(f"  {name} {dl.season_label(year)}: {champ} ({len(squad)} players)")
        print(f"{name}: {won} seasons resolved")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({str(k): v for k, v in tally.items()}), encoding="utf-8")
    print(f"wrote trophies for {len(tally)} players to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
