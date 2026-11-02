"""Project players.json down to what the browser needs.

The full file carries fields the game never reads and would ship 1.7MB to every
visitor. This keeps the guessable columns only, and marks which players are
recognizable enough to be the answer.

    python scripts/build_game_data.py

Output: src/data/game-players.json
"""

from __future__ import annotations

import json
from pathlib import Path

LEAGUE_ID = {
    "Premier League": 17, "La Liga": 8, "Serie A": 23,
    "Bundesliga": 35, "Ligue 1": 34,
}

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "data" / "players.json"
OUT = ROOT / "src" / "data" / "game-players.json"

# An answer has to be a player people can actually name. Squad filler stays
# guessable, it just never becomes the target.
#
# Market value was the wrong filter: it rates an unknown 18-year-old at a
# mid-table club above an established international, and it made Samir El
# Mourabet of Strasbourg a daily answer. Sofascore's follower count measures
# fame directly, so it is the gate, with a minutes floor to keep the answer
# someone who is actually playing this season.
ANSWER_MIN_FOLLOWERS = 25_000
ANSWER_MIN_MINUTES = 450

# Sofascore's detailed positions, collapsed to the roles a fan would say.
ROLE = {"GK": "GK", "DC": "CB", "DL": "FB", "DR": "FB", "DM": "DM", "MC": "CM",
        "AM": "AM", "LW": "W", "RW": "W", "ML": "W", "MR": "W", "ST": "ST"}
# Fallback when a player has no detailed position recorded.
BROAD = {"GK": "GK", "DEF": "CB", "MID": "CM", "FWD": "ST"}


def role_of(p: dict) -> str:
    for token in p.get("detailedPositions") or []:
        if token in ROLE:
            return ROLE[token]
    return BROAD.get(p.get("position"), "CM")


def main() -> None:
    players = json.loads(SRC.read_text(encoding="utf-8"))
    out = []
    for p in players:
        if not p["country"]:
            continue          # one player has no country; every column must resolve
        out.append({
            "id": p["id"],
            "name": p["name"],
            "team": p["team"],
            "teamId": p["teamId"],
            "league": p["league"],
            "leagueId": LEAGUE_ID[p["league"]],
            "country": p["country"],
            "continent": p["continent"],
            "role": role_of(p),
            "goals": p["careerGoals"],
            "assists": p["careerAssists"],
            "ucl": p["uclTitles"],
            "titles": p["leagueTitles"],
            "followers": p.get("followers", 0),
            "answer": p.get("followers", 0) >= ANSWER_MIN_FOLLOWERS
                      and p["recentMinutes"] >= ANSWER_MIN_MINUTES,
        })
    out.sort(key=lambda p: p["name"])
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    kb = OUT.stat().st_size / 1024
    print(f"wrote {len(out)} players ({sum(p['answer'] for p in out)} answerable) "
          f"to {OUT.relative_to(ROOT)}, {kb:.0f}KB")


if __name__ == "__main__":
    main()
