const state = {
  botId: "gh204",
  data: null,
  botIds: [],
};

function toPct(wins, losses) {
  const total = wins + losses;
  if (!total) return "-";
  return `${((wins / total) * 100).toFixed(1)}%`;
}

/** Win-rate tier for cell background (0–100% wins). */
function scoreClass(wins, losses) {
  const total = wins + losses;
  if (total === 0) return "";
  const pct = (wins / total) * 100;
  if (pct >= 95) return "cell-wr-g5";
  if (pct >= 85) return "cell-wr-g4";
  if (pct >= 72) return "cell-wr-g3";
  if (pct >= 58) return "cell-wr-g2";
  if (pct >= 52) return "cell-wr-g1";
  if (pct >= 45) return "cell-wr-y";
  if (pct >= 32) return "cell-wr-o";
  if (pct >= 18) return "cell-wr-r2";
  return "cell-wr-r3";
}

function renderWinLoss(wins, losses) {
  if (wins === 0 && losses === 0) {
    return "<td>-</td>";
  }
  return `<td class="${scoreClass(wins, losses)}">${wins}/${losses}</td>`;
}

function renderRate(wins, losses) {
  if (wins === 0 && losses === 0) {
    return "<td>-</td>";
  }
  const value = toPct(wins, losses);
  return `<td class="${scoreClass(wins, losses)}">${value}</td>`;
}

function sumByHandicap(byHandicap, winKey, lossKey) {
  const rows = Object.values(byHandicap || {});
  return rows.reduce(
    (acc, row) => {
      acc.games += row.games || 0;
      acc.wins += row[winKey] || 0;
      acc.losses += row[lossKey] || 0;
      return acc;
    },
    { games: 0, wins: 0, losses: 0 }
  );
}

function getWinLoss(row) {
  return {
    wins: row?.wins ?? row?.botWins ?? 0,
    losses: row?.losses ?? row?.botLosses ?? 0,
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function collectHandicaps(rows) {
  const seen = new Set();
  for (const row of rows || []) {
    for (const handicap of Object.keys(row?.by_handicap || {})) {
      seen.add(String(handicap));
    }
  }
  return [...seen].sort((a, b) => Number(a) - Number(b));
}

/** Same ordering as by-rank chart / publisher (pro → dan → kyu → other). */
function rankSortKey(value) {
  const text = String(value || "?").trim().toLowerCase();
  if (/^\d+p$/.test(text)) return [0, -parseInt(text, 10)];
  if (/^\d+d$/.test(text)) return [1, -parseInt(text, 10)];
  if (/^\d+k$/.test(text)) return [2, parseInt(text, 10)];
  return [3, text];
}

function compareRankValues(a, b) {
  const ka = rankSortKey(a);
  const kb = rankSortKey(b);
  if (ka[0] !== kb[0]) return ka[0] - kb[0];
  if (ka[1] !== kb[1]) {
    if (typeof ka[1] === "string" && typeof kb[1] === "string") {
      return ka[1].localeCompare(kb[1]);
    }
    return ka[1] - kb[1];
  }
  return 0;
}

function setSplitHeader(tableId, firstLabel, handicaps) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const thead = table.querySelector("thead");
  if (!thead) return;
  const handicapHeaders = handicaps.map((handicap) => `<th>H${escapeHtml(handicap)}</th>`).join("");
  thead.innerHTML = `
    <tr>
      <th>${firstLabel}</th>
      <th>Games</th>
      ${handicapHeaders}
      <th>Wins</th>
      <th>Losses</th>
      <th>Win Rate</th>
    </tr>
  `;
}

function renderHandicapCells(byHandicap, handicaps) {
  return handicaps
    .map((handicap) => {
      const row = byHandicap?.[handicap];
      const { wins, losses } = getWinLoss(row);
      return renderWinLoss(wins, losses);
    })
    .join("");
}

function normalizeByDateRows(byDateObj) {
  return Object.entries(byDateObj || {})
    .map(([date, day]) => ({
      date,
      by_handicap: day?.by_handicap || day?.byHandicap || {},
      games: day?.games,
      wins: day?.wins,
      losses: day?.losses,
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function totalsFromByHandicap(byHandicap) {
  return Object.values(byHandicap || {}).reduce(
    (acc, handicapRow) => {
      const { wins, losses } = getWinLoss(handicapRow);
      acc.games += handicapRow?.games || 0;
      acc.wins += wins;
      acc.losses += losses;
      return acc;
    },
    { games: 0, wins: 0, losses: 0 }
  );
}

function summarizeByDateFromGameDetails(gamesDetail) {
  const rows = Array.isArray(gamesDetail) ? gamesDetail : [];
  const map = new Map();
  for (const game of rows) {
    const date = String(game?.date || "").trim();
    if (!date) continue;
    const handicap = String(game?.handicap ?? 0);
    const day = map.get(date) || { games: 0, wins: 0, losses: 0, by_handicap: {} };
    const byHandicap = day.by_handicap[handicap] || { games: 0, wins: 0, losses: 0 };
    const won = Boolean(game?.botWon);
    const lost = Boolean(game?.botLost);
    day.games += 1;
    day.wins += won ? 1 : 0;
    day.losses += lost ? 1 : 0;
    byHandicap.games += 1;
    byHandicap.wins += won ? 1 : 0;
    byHandicap.losses += lost ? 1 : 0;
    day.by_handicap[handicap] = byHandicap;
    map.set(date, day);
  }
  return Object.fromEntries(map.entries());
}

function clearBody(bodyId) {
  const body = document.getElementById(bodyId);
  body.innerHTML = "";
  return body;
}

function appendEmptyRow(body, columns, message) {
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = columns;
  td.className = "is-empty";
  td.textContent = message;
  tr.appendChild(td);
  body.appendChild(tr);
}

function renderByDay(byDay) {
  const body = clearBody("byDayBody");
  if (!Array.isArray(byDay) || byDay.length === 0) {
    appendEmptyRow(body, 5, "No by-day data.");
    return;
  }
  const handicaps = collectHandicaps(byDay);
  setSplitHeader("byDayTable", "Date", handicaps);
  for (const row of byDay) {
    const totals = Object.values(row.by_handicap || {}).reduce(
      (acc, handicapRow) => {
        const { wins, losses } = getWinLoss(handicapRow);
        acc.games += handicapRow?.games || 0;
        acc.wins += wins;
        acc.losses += losses;
        return acc;
      },
      { games: 0, wins: 0, losses: 0 }
    );
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.date || "-")}</td>
      <td>${totals.games}</td>
      ${renderHandicapCells(row.by_handicap, handicaps)}
      <td>${totals.wins}</td>
      <td>${totals.losses}</td>
      ${renderRate(totals.wins, totals.losses)}
    `;
    body.appendChild(tr);
  }
}

function renderByRank(byRank) {
  const body = clearBody("byRankBody");
  if (!Array.isArray(byRank) || byRank.length === 0) {
    appendEmptyRow(body, 5, "No by-rank data.");
    return;
  }
  const handicaps = collectHandicaps(byRank);
  setSplitHeader("byRankTable", "Rank", handicaps);
  for (const row of byRank) {
    const totals = Object.values(row.by_handicap || {}).reduce(
      (acc, handicapRow) => {
        const { wins, losses } = getWinLoss(handicapRow);
        acc.games += handicapRow?.games || 0;
        acc.wins += wins;
        acc.losses += losses;
        return acc;
      },
      { games: 0, wins: 0, losses: 0 }
    );
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.rank || "-")}</td>
      <td>${totals.games}</td>
      ${renderHandicapCells(row.by_handicap, handicaps)}
      <td>${totals.wins}</td>
      <td>${totals.losses}</td>
      ${renderRate(totals.wins, totals.losses)}
    `;
    body.appendChild(tr);
  }
}

function renderByOpponent(byOpponent) {
  const body = clearBody("byOpponentBody");
  if (!Array.isArray(byOpponent) || byOpponent.length === 0) {
    appendEmptyRow(body, 6, "No by-opponent data.");
    return;
  }
  const sorted = [...byOpponent].sort((a, b) => {
    const byRank = compareRankValues(a.rank, b.rank);
    if (byRank !== 0) return byRank;
    return (b.games || 0) - (a.games || 0);
  });
  const table = document.getElementById("byOpponentTable");
  const thead = table?.querySelector("thead");
  if (thead) {
    thead.innerHTML = `
      <tr>
        <th>Opponent</th>
        <th>Rank</th>
        <th>Games</th>
        <th>Wins</th>
        <th>Losses</th>
        <th>Win Rate</th>
        <th>Details</th>
      </tr>
    `;
  }
  for (const row of sorted) {
    const byDate =
      row.by_date ||
      row.byDate ||
      summarizeByDateFromGameDetails(row.games_detail || row.gamesDetail || []);
    const detailByDateRows = normalizeByDateRows(byDate);
    const detailHandicaps = collectHandicaps(detailByDateRows);
    const detailHeaderCells = detailHandicaps.map((handicap) => `<th>H${escapeHtml(handicap)}</th>`).join("");
    const detailRows = detailByDateRows
      .map((dateRow) => {
        const summary = totalsFromByHandicap(dateRow.by_handicap);
        return `
          <tr>
            <td>${escapeHtml(dateRow.date)}</td>
            <td>${summary.games}</td>
            ${renderHandicapCells(dateRow.by_handicap, detailHandicaps)}
            <td>${summary.wins}</td>
            <td>${summary.losses}</td>
            ${renderRate(summary.wins, summary.losses)}
          </tr>
        `;
      })
      .join("");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.opponent || "-")}</td>
      <td>${escapeHtml(row.rank || "-")}</td>
      <td>${row.games || 0}</td>
      <td>${row.wins || 0}</td>
      <td>${row.losses || 0}</td>
      ${renderRate(row.wins || 0, row.losses || 0)}
      <td><button class="details-toggle" type="button">View</button></td>
    `;
    body.appendChild(tr);

    const detailTr = document.createElement("tr");
    detailTr.className = "details-row";
    detailTr.hidden = true;
    detailTr.innerHTML = `
      <td colspan="7">
        <div class="details-card">
          <h3>By date and handicap</h3>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Games</th>
                  ${detailHeaderCells}
                  <th>Wins</th>
                  <th>Losses</th>
                  <th>Win Rate</th>
                </tr>
              </thead>
              <tbody>
                ${
                  detailRows ||
                  `<tr><td colspan="${5 + detailHandicaps.length}" class="is-empty">No by-date handicap breakdown.</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>
      </td>
    `;
    body.appendChild(detailTr);

    const btn = tr.querySelector(".details-toggle");
    btn.addEventListener("click", () => {
      const isHidden = detailTr.hidden;
      detailTr.hidden = !isHidden;
      btn.textContent = isHidden ? "Hide" : "View";
    });
  }
}

function getTopRank(payload) {
  return (
    payload?.top100_rank ??
    payload?.top100?.rank ??
    payload?.kgs_top100_rank ??
    payload?.metadata?.top100_rank
  );
}

function setSummaryLine(rank, gameCount, botId) {
  const el = document.getElementById("statusLine");
  if (!el) return;
  const rankText = rank ? `#${rank}` : "#-";
  el.innerHTML = `The bot ranks ${rankText} on the <a href="https://www.gokgs.com/top100.jsp" target="_blank" rel="noreferrer">Top KGS 100 chart</a>. Stats based on ${gameCount} games for ${escapeHtml(botId)}.`;
}

const DEFAULT_BOT_IDS = ["gh200", "gh204"];

async function fetchAvailableBotIds() {
  if (window.location.pathname.startsWith("/preview/")) {
    try {
      const response = await fetch("/preview-data/publish/repo/stats/", { headers: { Accept: "text/html" } });
      if (!response.ok) throw new Error(`list failed: ${response.status}`);
      const html = await response.text();
      const matches = [...html.matchAll(/href="([^"]+\.json)"/g)];
      const ids = matches
        .map((m) => decodeURIComponent(m[1]))
        .map((name) => name.split("/").pop()?.replace(/\.json$/i, ""))
        .filter(Boolean);
      const uniq = [...new Set(ids)].sort((a, b) => a.localeCompare(b));
      if (uniq.length) return uniq;
    } catch {
      /* fall through to bots.json */
    }
  }

  try {
    const response = await fetch("/bots.json", { cache: "no-store", headers: { Accept: "application/json" } });
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length) {
        return [...new Set(data.map((id) => String(id).trim()).filter(Boolean))].sort((a, b) =>
          a.localeCompare(b)
        );
      }
    }
  } catch {
    /* use defaults */
  }

  return [...DEFAULT_BOT_IDS];
}

function populateBotSelect(botIds) {
  const select = document.getElementById("botIdSelect");
  if (!select) return;
  select.innerHTML = "";
  for (const botId of botIds) {
    const option = document.createElement("option");
    option.value = botId;
    option.textContent = botId;
    if (botId === state.botId) option.selected = true;
    select.appendChild(option);
  }
  if (!botIds.includes(state.botId) && botIds[0]) {
    state.botId = botIds[0];
    select.value = botIds[0];
  }
}

function setStatus(text) {
  document.getElementById("statusLine").textContent = text;
}

function updateTime() {
  document.getElementById("year").textContent = new Date().getFullYear();
  document.getElementById("lastUpdated").textContent = new Date().toLocaleString();
}

function resolveStatsEndpoint(botId) {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("statsEndpoint");
  const fromBody = document.body?.dataset?.statsEndpoint;
  let template = (fromQuery || fromBody || "/.netlify/functions/stats").trim();
  if (!fromQuery && template === "/.netlify/functions/stats" && window.location.pathname.startsWith("/preview/")) {
    template = "/preview-data/publish/repo/stats/{botId}.json";
  }
  if (template.includes("{botId}")) {
    return template.replaceAll("{botId}", encodeURIComponent(botId));
  }
  const url = new URL(template, window.location.origin);
  url.searchParams.set("botId", botId);
  return url.toString();
}

async function loadStats() {
  const botId = state.botId.trim();
  if (!botId) {
    setStatus("Bot ID is required.");
    return;
  }
  setStatus(`Loading stats for ${botId}...`);
  try {
    const response = await fetch(resolveStatsEndpoint(botId), {
      headers: { Accept: "application/json" },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || `Request failed with ${response.status}`);
    }
    state.data = payload;
    const rank = getTopRank(payload);
    renderByDay(payload.by_day);
    renderByRank(payload.by_rank_handicap);
    renderByOpponent(payload.by_opponent);
    updateTime();
    setSummaryLine(rank, payload.games?.length || 0, botId);
  } catch (error) {
    setStatus(`Failed to load stats: ${error.message}`);
  }
}

function getBotIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get("botId") || "";
}

function bindEvents() {
  const controls = document.getElementById("controls");
  const input = document.getElementById("botIdSelect");
  const refreshBtn = document.getElementById("refreshBtn");
  controls.addEventListener("submit", (event) => {
    event.preventDefault();
    state.botId = input.value.trim();
    const url = new URL(window.location.href);
    url.searchParams.set("botId", state.botId);
    window.history.replaceState({}, "", url.toString());
    loadStats();
  });
  refreshBtn.addEventListener("click", () => {
    state.botId = input.value.trim();
    loadStats();
  });
}

function init() {
  const fromQuery = getBotIdFromQuery();
  const input = document.getElementById("botIdSelect");
  if (fromQuery) {
    state.botId = fromQuery;
  } else {
    state.botId = state.botId.trim();
  }
  fetchAvailableBotIds().then((botIds) => {
    state.botIds = botIds;
    populateBotSelect(botIds);
    if (input) input.value = state.botId;
    bindEvents();
    loadStats();
  });
}

init();
