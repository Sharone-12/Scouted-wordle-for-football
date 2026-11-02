"""Career goals/assists for every player, by league-season rather than by player.

Sofascore has no career aggregate. Asking per player costs one request per
competition-season they ever played: Harry Kane alone has 70. The bulk league
endpoint instead returns *every* player in a league-season in ~9 requests, so
sweeping 19 seasons of the top 5 leagues plus the Champions League covers the
whole pool for ~1000 requests.

Scope, and the reason the number means the same thing for everyone: top-5
European leagues + Champions League, 2008/09 onward. Goals scored in the
Eredivisie, the Championship, Brazil or a domestic cup are not counted.

    python scripts/fetch_career.py            resume from cache
    python scripts/fetch_career.py --refresh  refetch

Output: src/data/career.json  {player_id: {goals, assists, appearances, minutes}}
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

SCRAPER = Path.home() / "sofascore-scraper"
sys.path.insert(0, str(SCRAPER))
import data_loader as dl  # noqa: E402

TOURNAMENTS = {
    "Premier League": 17, "La Liga": 8, "Serie A": 23,
    "Bundesliga": 35, "Ligue 1": 34, "Champions League": 7,
}
FIRST_SEASON = 2008
FIELDS = "goals,assists,appearances,minutesPlayed"
KEYS = {"goals": "goals", "assists": "assists",
        "appearances": "appearances", "minutesPlayed": "minutes"}

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "data" / "career.json"
CACHE = SCRAPER / "data" / "raw"


def page_rows(tournament: int, sid: int, code: str, refresh: bool):
    """Every player row for one league-season and position, all pages.

    Unlike the scraper's own pager this does not stop at the 10% minutes
    cutoff: a career total has to include the squad player who played 200
    minutes in 2014, or his total silently reads as zero.
    """
    page = 0
    while True:
        url = (f"{dl.SOFASCORE}/api/v1/unique-tournament/{tournament}/season/{sid}"
               f"/statistics?limit=100&offset={page * 100}&order=-minutesPlayed"
               f"&accumulation=total&fields={FIELDS}&filters=position.in.{code}")
        data = dl._get(url, CACHE / f"car_{tournament}_{sid}_{code}_{page}.json", refresh)
        yield from data.get("results", [])
        page += 1
        if page >= (data.get("pages") or 1):
            return


def main() -> None:
    refresh = "--refresh" in sys.argv
    totals: dict[int, dict] = {}
    last = dl.current_season()

    for name, tournament in TOURNAMENTS.items():
        seasons = {y: s for y, s in dl.get_season_ids(tournament, refresh).items()
                   if FIRST_SEASON <= y <= last}
        for year in sorted(seasons):
            n = 0
            for code in dl.POSITIONS:
                try:
                    for r in page_rows(tournament, seasons[year], code, refresh):
                        t = totals.setdefault(int(r["player"]["id"]), dict.fromkeys(KEYS.values(), 0))
                        for src, dst in KEYS.items():
                            t[dst] += int(r.get(src) or 0)
                        n += 1
                except RuntimeError as e:
                    # One missing season must not sink the other eighteen.
                    print(f"  SKIPPED {name} {dl.season_label(year)} {code}: {e}")
            print(f"{name} {dl.season_label(year)}: {n} rows, {len(totals)} players so far")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({str(k): v for k, v in totals.items()}), encoding="utf-8")
    print(f"wrote career totals for {len(totals)} players to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
