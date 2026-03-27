#!/usr/bin/env bash
set -euo pipefail

# Publishes stats to a private GitHub repo via git push.
# Source is kgs-bot-monitor's local API: GET /api/bots/:id/stats (auth via MONITOR_API_KEY).

ENV_FILE="${ENV_FILE:-/opt/kgsbot-stats/env}"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 2
fi

set -a
source "$ENV_FILE"
set +a

# After sourcing env, allow one-off multi-bot publishes: PUBLISH_BOT_ID=gh200 ./publish.sh
if [ -n "${PUBLISH_BOT_ID:-}" ]; then
  BOT_ID="$PUBLISH_BOT_ID"
  BOT_KGS_NAME="$BOT_ID"
fi

: "${BOT_ID:?BOT_ID is required}"
: "${MONITOR_BASE_URL:?MONITOR_BASE_URL is required}"
: "${MONITOR_API_KEY:?MONITOR_API_KEY is required}"
: "${REPO:?REPO is required (owner/repo)}"
: "${BRANCH:=main}"
: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
: "${KGS_TOP100_URL:=https://www.gokgs.com/top100.jsp}"
: "${BOT_KGS_NAME:=$BOT_ID}"
: "${EXCLUDED_OPPONENTS:=ZARYBOT2,SWISSKAT1,SWISSPACH1,BOTANICAL}"

WORKROOT="${WORKROOT:-/opt/kgsbot-stats}"
WORKDIR="${WORKDIR:-$WORKROOT/repo}"
REPO_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO}.git"

mkdir -p "$WORKROOT"

if [ ! -d "$WORKDIR/.git" ]; then
  rm -rf "$WORKDIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$WORKDIR"
fi

cd "$WORKDIR"
git remote set-url origin "$REPO_URL"
git fetch origin "$BRANCH" --prune
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

mkdir -p stats

BASE="${MONITOR_BASE_URL%/}"
URL="${BASE}/api/bots/${BOT_ID}/stats"

TMP_JSON="$(mktemp)"
trap 'rm -f "$TMP_JSON"' EXIT

curl -fsS \
  -H "Accept: application/json" \
  -H "Authorization: Bearer ${MONITOR_API_KEY}" \
  "$URL" > "$TMP_JSON"

TOP100_HTML="$(curl -fsSL --max-time 15 "$KGS_TOP100_URL" || true)"
TOP100_RANK="$(
  python3 - "$BOT_KGS_NAME" "$TOP100_HTML" <<'PY' || true
import re
import sys

name = sys.argv[1].strip().lower()
html = sys.argv[2]
if not name or not html:
    raise SystemExit(0)

rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, flags=re.I | re.S)
for row in rows:
    text = re.sub(r"<[^>]+>", " ", row)
    text = re.sub(r"\s+", " ", text).strip()
    if name not in text.lower():
        continue
    m = re.search(r"\b(\d{1,3})\b", text)
    if m:
        print(m.group(1))
        raise SystemExit(0)
PY
)"

python3 - "$TMP_JSON" "stats/${BOT_ID}.json" "${TOP100_RANK:-}" "${BOT_ID}" "${EXCLUDED_OPPONENTS}" <<'PY'
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict

new_path = Path(sys.argv[1])
target_path = Path(sys.argv[2])
rank = sys.argv[3].strip()
bot_id = sys.argv[4].strip()
excluded_opponents = {x.strip().upper() for x in sys.argv[5].split(",") if x.strip()}


def opponent_for(game, bot_name):
    black = (game.get("black") or "").strip()
    white = (game.get("white") or "").strip()
    if black.upper() == bot_name.upper():
        return white
    if white.upper() == bot_name.upper():
        return black
    # Fallback for unexpected shape: choose non-empty side.
    return white or black


def rank_sort_key(value):
    text = (value or "?").strip().lower()
    if text.endswith("p") and text[:-1].isdigit():
        return (0, -int(text[:-1]))
    if text.endswith("d") and text[:-1].isdigit():
        return (1, -int(text[:-1]))
    if text.endswith("k") and text[:-1].isdigit():
        return (2, int(text[:-1]))
    return (3, text)

with new_path.open("r", encoding="utf-8") as fh:
    payload = json.load(fh)

if target_path.exists():
    with target_path.open("r", encoding="utf-8") as fh:
        existing = json.load(fh)
else:
    existing = {}

games = payload.get("games") or []
filtered_games = []
for game in games:
    opp = opponent_for(game, bot_id)
    if (opp or "").strip().upper() in excluded_opponents:
        continue
    filtered_games.append(game)

by_day = defaultdict(lambda: defaultdict(lambda: {"games": 0, "botWins": 0, "botLosses": 0}))
by_rank = defaultdict(lambda: defaultdict(lambda: {"games": 0, "wins": 0, "losses": 0}))
by_opp = {}

for game in filtered_games:
    date = game.get("date") or "-"
    handicap = str(game.get("handicap", 0))
    game_rank = game.get("rank") or "?"
    opp = opponent_for(game, bot_id) or "-"
    won = bool(game.get("botWon"))
    lost = bool(game.get("botLost"))

    day_bucket = by_day[date][handicap]
    day_bucket["games"] += 1
    day_bucket["botWins"] += 1 if won else 0
    day_bucket["botLosses"] += 1 if lost else 0

    rank_bucket = by_rank[game_rank][handicap]
    rank_bucket["games"] += 1
    rank_bucket["wins"] += 1 if won else 0
    rank_bucket["losses"] += 1 if lost else 0

    if opp not in by_opp:
        by_opp[opp] = {
            "opponent": opp,
            "rank": game_rank,
            "games": 0,
            "wins": 0,
            "losses": 0,
            "games_detail": [],
        }
    opp_row = by_opp[opp]
    opp_row["games"] += 1
    opp_row["wins"] += 1 if won else 0
    opp_row["losses"] += 1 if lost else 0
    opp_row["games_detail"].append(
        {
            "date": date,
            "result": game.get("result"),
            "isBlackWin": bool(game.get("isBlackWin")),
            "isWhiteWin": bool(game.get("isWhiteWin")),
            "botWon": won,
            "botLost": lost,
            "handicap": game.get("handicap", 0),
            "opponent": opp,
        }
    )

payload["games"] = filtered_games
payload["by_day"] = [
    {"date": date, "by_handicap": dict(by_day[date])}
    for date in sorted(by_day.keys(), reverse=True)
]
payload["by_rank_handicap"] = [
    {"rank": rank_key, "by_handicap": dict(by_rank[rank_key])}
    for rank_key in sorted(by_rank.keys(), key=rank_sort_key)
]
payload["by_opponent"] = sorted(
    by_opp.values(),
    key=lambda row: (-int(row.get("games") or 0), (row.get("opponent") or "").lower()),
)
payload["excluded_opponents"] = sorted(excluded_opponents)

if rank:
    payload["top100_rank"] = int(rank)
    payload["top100_updated_at"] = datetime.now(timezone.utc).isoformat()
elif "top100_rank" in existing:
    # Keep the last known value when gokgs top100 is unavailable.
    payload["top100_rank"] = existing["top100_rank"]
    if "top100_updated_at" in existing:
        payload["top100_updated_at"] = existing["top100_updated_at"]

target_path.parent.mkdir(parents=True, exist_ok=True)
with target_path.open("w", encoding="utf-8") as fh:
    json.dump(payload, fh, ensure_ascii=False, indent=2, sort_keys=True)
    fh.write("\n")
PY

git add "stats/${BOT_ID}.json"
if git diff --cached --quiet; then
  exit 0
fi

git -c user.name="kgsbot-stats" -c user.email="kgsbot-stats@users.noreply.github.com" \
  commit -m "Update ${BOT_ID} stats"

git push origin "$BRANCH"

