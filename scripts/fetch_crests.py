"""Download club crests and league badges once into public/.

Clubs land in public/clubs/{team_id}.png, leagues in public/leagues/{id}.png.

Sofascore serves these, but hotlinking spends their bandwidth on a path they
gate and only works when the browser sends no referer — one tightened rule and
every crest in the game breaks at once. 96 files is nothing to host ourselves.

    python scripts/fetch_crests.py            fetch what is missing
    python scripts/fetch_crests.py --refresh  refetch everything
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLAYERS = ROOT / "src" / "data" / "players.json"
CLUBS = ROOT / "public" / "clubs"
LEAGUES_OUT = ROOT / "public" / "leagues"

# Sofascore's unique-tournament ids, the same ones the scraper sweeps.
LEAGUES = {
    17: "Premier League",
    8: "La Liga",
    23: "Serie A",
    35: "Bundesliga",
    34: "Ligue 1",
}
SOURCE = "https://img.sofascore.com/api/v1"

# Cloudflare 403s a request with no User-Agent at all, and serves the image
# only when no foreign referer is attached. Both matter here.
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)


def grab(path: str, dest: Path, label: str, refresh: bool) -> str:
    """Returns 'skipped', 'got' or 'missing'."""
    if dest.exists() and not refresh:
        return "skipped"
    req = urllib.request.Request(f"{SOURCE}/{path}/image", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as e:
        print(f"  MISSING {label}: {e}")
        return "missing"
    if not body:
        print(f"  EMPTY {label}")
        return "missing"
    dest.write_bytes(body)
    time.sleep(0.2)
    return "got"


def main() -> None:
    refresh = "--refresh" in sys.argv
    CLUBS.mkdir(parents=True, exist_ok=True)
    LEAGUES_OUT.mkdir(parents=True, exist_ok=True)

    clubs = {p["teamId"]: p["team"] for p in json.loads(PLAYERS.read_text(encoding="utf-8"))}
    for out, items, kind in (
        (CLUBS, sorted(clubs.items(), key=lambda kv: kv[1]), "team"),
        (LEAGUES_OUT, sorted(LEAGUES.items(), key=lambda kv: kv[1]), "unique-tournament"),
    ):
        tally = {"got": 0, "skipped": 0, "missing": 0}
        for ident, name in items:
            tally[grab(f"{kind}/{ident}", out / f"{ident}.png", f"{name} ({ident})", refresh)] += 1
        print(f"{out.name}: {len(items)} total, {tally['got']} downloaded, "
              f"{tally['skipped']} already present, {tally['missing']} missing")


if __name__ == "__main__":
    main()
