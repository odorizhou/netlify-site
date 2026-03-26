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

: "${BOT_ID:?BOT_ID is required}"
: "${MONITOR_BASE_URL:?MONITOR_BASE_URL is required}"
: "${MONITOR_API_KEY:?MONITOR_API_KEY is required}"
: "${REPO:?REPO is required (owner/repo)}"
: "${BRANCH:=main}"
: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"

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

curl -fsS \
  -H "Accept: application/json" \
  -H "Authorization: Bearer ${MONITOR_API_KEY}" \
  "$URL" > "stats/${BOT_ID}.json"

git add "stats/${BOT_ID}.json"
if git diff --cached --quiet; then
  exit 0
fi

git -c user.name="kgsbot-stats" -c user.email="kgsbot-stats@users.noreply.github.com" \
  commit -m "Update ${BOT_ID} stats"

git push origin "$BRANCH"

