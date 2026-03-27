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

For the default template, create one JSON file per bot, for example:

- `stats/gh204.json`
- `stats/gh200.json`
- `stats/otherBotId.json`

These files must contain the JSON payload your frontend expects (e.g. fields like `by_day`, `by_rank_handicap`, `by_opponent`, `games`).
The frontend also reads optional `top100_rank` and `top100_updated_at`.

## Endpoints

- Browser → Netlify Function:
  - `/.netlify/functions/stats?botId=gh204`
- Convenience redirect (same result):
  - `/api/bots/gh204/stats`

## VPS publisher (hourly)

Publish stats from the machine running `kgs-bot-monitor` to the private GitHub repo via `git push`.

- Source stats endpoint (local-only): `http://127.0.0.1:4001/api/bots/<botId>/stats`
- Auth: `Authorization: Bearer <MONITOR_API_KEY>`
- Optional top100 enrichment: `https://www.gokgs.com/top100.jsp` (keeps previous rank if fetch fails)
- Optional opponent filtering: set `EXCLUDED_OPPONENTS` (comma-separated, defaults to `ZARYBOT2,SWISSKAT1,SWISSPACH1,BOTANICAL`)

### Install on the VPS

Copy the templates from this repo:

- `vps/publish.sh` → `/opt/kgsbot-stats/publish.sh`
- `vps/env.example` → `/opt/kgsbot-stats/env` (fill values)
- `vps/cron.example` → `/etc/cron.d/kgsbot-stats`

Then run once:

- `/opt/kgsbot-stats/publish.sh`

Each run publishes **one** bot (`BOT_ID` in env). For multiple bots (e.g. `gh204` and `gh200`), run the publisher once per bot with `BOT_ID` changed, or use separate cron entries.

## Netlify deploy readiness (check before going live)

Do **not** skip these if you want production to match preview:

- [ ] `netlify build` succeeds in this repo (bundles `netlify/functions/stats.mjs`).
- [ ] Netlify site env vars are set: `STATS_GITHUB_REPO`, `STATS_GITHUB_TOKEN` (and optional `STATS_GITHUB_BRANCH`, `STATS_GITHUB_PATH_TEMPLATE`).
- [ ] The private GitHub repo contains `stats/{botId}.json` for every bot users can select (e.g. `stats/gh204.json`, `stats/gh200.json`).
- [ ] The token can read those files via the GitHub Contents API.

## External preview on `:6006/preview` (Apache)

If port `6006` is externally reachable but local dev ports are not, expose a preview route via Apache.

- Keep production monitor route as-is: `/monitor`
- Add preview route: `/preview` -> local static server (example: `127.0.0.1:4173`)
- Use `vps/apache-preview.conf.example` as a template

### Run preview server locally

From this repo:

- `python3 -m http.server 4173`

Then Apache proxies `/preview/` to that server.

### Data endpoint behavior

The page reads `data-stats-endpoint` from `<body>` (default: `/.netlify/functions/stats`).

- Query style endpoint (default): `/.netlify/functions/stats?botId=gh204`
- Template style endpoint: `/monitor/api/bots/{botId}/stats`

You can override without code changes using URL query param:

- `?statsEndpoint=/monitor/api/bots/{botId}/stats`

## Local mock JSON preview (no Netlify/GitHub dependency)

For pure layout/UI checks, use bundled mock data:

- Mock file: `mock/stats/gh204.json`
- Preview URL:
  - `http://45.18.173.26:55492/preview/?statsEndpoint=/preview/mock/stats/{botId}.json`

This bypasses VPS publisher, GitHub storage, and Netlify function entirely.


