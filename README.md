# KGS Bot Stats (Netlify)

This site renders a public dashboard, but **does not expose the VPS**.

The browser calls a Netlify Function (`/.netlify/functions/stats`) which fetches a JSON stats file from a **private GitHub repository** using a token stored in Netlify environment variables.

## Required Netlify environment variables

- `STATS_GITHUB_REPO`: GitHub repo in `owner/repo` form (example: `odorizhou/kgsbot-stats-private`)
- `STATS_GITHUB_TOKEN`: GitHub token with **read-only** access to that repo contents

## Optional environment variables

- `STATS_GITHUB_BRANCH`: defaults to `main`
- `STATS_GITHUB_PATH_TEMPLATE`: defaults to `stats/{botId}.json`
  - `{botId}` is replaced with the `botId` query parameter

## Expected GitHub repo layout

For the default template, create files like:

- `stats/gh204.json`
- `stats/otherBotId.json`

These files must contain the JSON payload your frontend expects (e.g. fields like `by_day`, `by_rank_handicap`, `by_opponent`, `games`).

## Endpoints

- Browser → Netlify Function:
  - `/.netlify/functions/stats?botId=gh204`
- Convenience redirect (same result):
  - `/api/bots/gh204/stats`

## VPS publisher (hourly)

Publish stats from the machine running `kgs-bot-monitor` to the private GitHub repo via `git push`.

- Source stats endpoint (local-only): `http://127.0.0.1:4001/api/bots/<botId>/stats`
- Auth: `Authorization: Bearer <MONITOR_API_KEY>`

### Install on the VPS

Copy the templates from this repo:

- `vps/publish.sh` → `/opt/kgsbot-stats/publish.sh`
- `vps/env.example` → `/opt/kgsbot-stats/env` (fill values)
- `vps/cron.example` → `/etc/cron.d/kgsbot-stats`

Then run once:

- `/opt/kgsbot-stats/publish.sh`


