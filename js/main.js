const state = {
  botId: "gh204",
  data: null,
  botIds: [],
  /** Set while By day data is loaded; used for year/month filtering. */
  byDayContext: null,
  /** "wl" = wins/losses per handicap; "rate" = win rate per handicap. */
  statsDisplayMode: "wl",
};

/** ISO date (YYYY-MM-DD): only games on or after this day are shown (per bot). */
const STATS_SINCE_BY_BOT = {
  gh204: "2026-03-16",
  gh200: "2026-03-22",
};

/** Opponent names excluded from stats (case-insensitive), per bot. */
const EXCLUDED_OPPONENTS_BY_BOT = {
  gh204: ["SWISSBOT1", "SWISSBOT6"],
};

function botHandleUpper(botId) {
  const n = String(botId || "")
    .replace(/^gh/i, "")
    .trim();
  return `GH${n}`.toUpperCase();
}

function opponentHandle(game, botId) {
  const bot = botHandleUpper(botId);
  const b = String(game.black || "").toUpperCase();
  const w = String(game.white || "").toUpperCase();
  if (b === bot) return String(game.white || "").trim();
  if (w === bot) return String(game.black || "").trim();
  return "";
}

function filterGamesForDisplay(games, botId) {
  let list = Array.isArray(games) ? [...games] : [];
  const since = STATS_SINCE_BY_BOT[botId];
  if (since) {
    list = list.filter((g) => String(g.date || "") >= since);
  }
  const excluded = EXCLUDED_OPPONENTS_BY_BOT[botId];
  if (excluded && excluded.length) {
    const ex = new Set(excluded.map((x) => String(x).toUpperCase()));
    list = list.filter((g) => {
      const opp = opponentHandle(g, botId);
      return opp && !ex.has(opp.toUpperCase());
    });
  }
  return list;
}

function gameToDetail(game, botId) {
  return {
    opponent: opponentHandle(game, botId),
    date: game.date,
    handicap: game.handicap,
    botWon: game.botWon,
    botLost: game.botLost,
    result: game.result,
    isBlackWin: game.isBlackWin,
    isWhiteWin: game.isWhiteWin,
  };
}

function handicapBreakdownFromDetails(details) {
  const byHandicap = {};
  for (const d of details) {
    const h = String(d.handicap ?? 0);
    if (!byHandicap[h]) {
      byHandicap[h] = { games: 0, wins: 0, losses: 0 };
    }
    const c = byHandicap[h];
    c.games += 1;
    if (d.botWon) c.wins += 1;
    if (d.botLost) c.losses += 1;
  }
  return byHandicap;
}

function buildByDateFromDetails(details) {
  const map = {};
  for (const d of details) {
    const date = d.date;
    if (!map[date]) map[date] = { by_handicap: {} };
    const h = String(d.handicap ?? 0);
    if (!map[date].by_handicap[h]) {
      map[date].by_handicap[h] = { games: 0, wins: 0, losses: 0 };
    }
    const cell = map[date].by_handicap[h];
    cell.games += 1;
    if (d.botWon) cell.wins += 1;
    if (d.botLost) cell.losses += 1;
  }
  return map;
}

function buildByDayFromGames(games) {
  const byDate = new Map();
  for (const g of games) {
    const d = g.date;
    if (!d) continue;
    let day = byDate.get(d);
    if (!day) {
      day = { date: d, by_handicap: {} };
      byDate.set(d, day);
    }
    const h = String(g.handicap ?? 0);
    if (!day.by_handicap[h]) {
      day.by_handicap[h] = { games: 0, botWins: 0, botLosses: 0 };
    }
    const cell = day.by_handicap[h];
    cell.games += 1;
    if (g.botWon) cell.botWins += 1;
    if (g.botLost) cell.botLosses += 1;
  }
  return [...byDate.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function buildByRankFromGames(games) {
  const byRank = new Map();
  for (const g of games) {
    const r = String(g.rank || "?").trim();
    if (!byRank.has(r)) {
      byRank.set(r, { rank: r, by_handicap: {} });
    }
    const row = byRank.get(r);
    const h = String(g.handicap ?? 0);
    if (!row.by_handicap[h]) {
      row.by_handicap[h] = { games: 0, wins: 0, losses: 0 };
    }
    const cell = row.by_handicap[h];
    cell.games += 1;
    if (g.botWon) cell.wins += 1;
    if (g.botLost) cell.losses += 1;
  }
  return [...byRank.values()].sort((a, b) => compareRankValues(a.rank, b.rank));
}

function buildByOpponentFromGames(games, botId) {
  const byOpp = new Map();
  for (const g of games) {
    const opp = opponentHandle(g, botId);
    if (!opp) continue;
    let row = byOpp.get(opp);
    if (!row) {
      row = { opponent: opp, games_detail: [], _latest: null };
      byOpp.set(opp, row);
    }
    row.games_detail.push(gameToDetail(g, botId));
    const gd = g.date || "";
    if (!row._latest || gd > row._latest.date) {
      row._latest = { date: gd, rank: g.rank };
    }
  }
  const out = [];
  for (const row of byOpp.values()) {
    row.rank = row._latest?.rank || "?";
    delete row._latest;
    const details = row.games_detail;
    row.games = details.length;
    row.wins = details.filter((x) => x.botWon).length;
    row.losses = details.filter((x) => x.botLost).length;
    row.by_handicap = handicapBreakdownFromDetails(details);
    row.by_date = buildByDateFromDetails(details);
    out.push(row);
  }
  return out;
}

function gamesArrayIsRebuildable(games) {
  if (!Array.isArray(games) || games.length === 0) return false;
  const g = games[0];
  return (
    g &&
    typeof g.date === "string" &&
    (Object.prototype.hasOwnProperty.call(g, "black") ||
      Object.prototype.hasOwnProperty.call(g, "white"))
  );
}

function applyStatsFilters(payload, botId) {
  if (!gamesArrayIsRebuildable(payload.games)) {
    return payload;
  }
  const games = filterGamesForDisplay(payload.games, botId);
  return {
    ...payload,
    games,
    by_day: buildByDayFromGames(games),
    by_rank_handicap: buildByRankFromGames(games),
    by_opponent: buildByOpponentFromGames(games, botId),
  };
}

function formatSinceDate(isoDate) {
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function monthKeyFromDate(isoDate) {
  return String(isoDate || "").slice(0, 7);
}

function monthLabelFromKey(ym) {
  const parts = String(ym).split("-");
  if (parts.length < 2) return ym;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function aggregateOpponentRowsWithHandicaps(gamesSubset, botId) {
  const byOpp = new Map();
  for (const g of gamesSubset) {
    const opp = opponentHandle(g, botId);
    if (!opp) continue;
    let row = byOpp.get(opp);
    if (!row) {
      row = { opponent: opp, _games: [], _lastDate: "" };
      byOpp.set(opp, row);
    }
    row._games.push(g);
    const gd = g.date || "";
    if (gd >= row._lastDate) {
      row._lastDate = gd;
      row.rank = g.rank;
    }
  }
  const rows = [];
  for (const row of byOpp.values()) {
    const byHandicap = {};
    for (const g of row._games) {
      const h = String(g.handicap ?? 0);
      if (!byHandicap[h]) {
        byHandicap[h] = { games: 0, wins: 0, losses: 0 };
      }
      const c = byHandicap[h];
      c.games += 1;
      if (g.botWon) c.wins += 1;
      if (g.botLost) c.losses += 1;
    }
    const wins = row._games.filter((x) => x.botWon).length;
    const losses = row._games.filter((x) => x.botLost).length;
    rows.push({
      opponent: row.opponent,
      rank: row.rank || "?",
      games: row._games.length,
      wins,
      losses,
      by_handicap: byHandicap,
    });
  }
  rows.sort((a, b) => {
    const r = compareRankValues(a.rank, b.rank);
    if (r !== 0) return r;
    return b.games - a.games;
  });
  return rows;
}

function buildPlayerDetailTableHtmlWithHandicaps(oppRows) {
  if (!oppRows.length) {
    return '<p class="is-empty">No per-player rows for this selection.</p>';
  }
  const handicaps = collectHandicaps(oppRows.map((r) => ({ by_handicap: r.by_handicap })));
  const thead = `<thead>${theadInnerHtmlStatsMode(["Opponent", "Rank", "Games"], handicaps, { includeDetails: false })}</thead>`;
  const tbody = oppRows
    .map((row) => {
      const totals = { wins: row.wins, losses: row.losses };
      return `<tr><td>${escapeHtml(row.opponent)}</td><td>${escapeHtml(row.rank)}</td><td>${row.games}</td>${cellsStatsModeBlock(row.by_handicap, handicaps, totals)}</tr>`;
    })
    .join("");
  return `<table>${thead}<tbody>${tbody}</tbody></table>`;
}

function filterByDayForSelection(fullByDay, year, monthKey) {
  let rows = fullByDay;
  if (year) {
    rows = rows.filter((row) => String(row.date || "").startsWith(`${year}-`));
  }
  if (monthKey) {
    rows = rows.filter((row) => monthKeyFromDate(row.date) === monthKey);
  }
  return rows;
}

function initByDayYearMonthFilters(fullByDay) {
  const nav = document.getElementById("byDayMonthNav");
  const yearSel = document.getElementById("byDayNavYear");
  const monthSel = document.getElementById("byDayNavMonth");
  if (!nav || !yearSel || !monthSel) return;

  const years = [
    ...new Set(fullByDay.map((r) => String(r.date || "").slice(0, 4)).filter(Boolean)),
  ].sort((a, b) => b.localeCompare(a));

  yearSel.innerHTML =
    `<option value="">All years</option>` +
    years.map((y) => `<option value="${escapeHtml(y)}">${escapeHtml(y)}</option>`).join("");

  function monthKeysForYear(y) {
    if (!y) return [];
    const keys = new Set();
    for (const row of fullByDay) {
      const d = String(row.date || "");
      if (d.startsWith(`${y}-`)) keys.add(monthKeyFromDate(d));
    }
    return [...keys].sort((a, b) => b.localeCompare(a));
  }

  function syncMonthSelect() {
    const y = yearSel.value;
    if (!y) {
      monthSel.innerHTML = '<option value="">All months</option>';
      monthSel.disabled = true;
      return;
    }
    monthSel.disabled = false;
    const mks = monthKeysForYear(y);
    monthSel.innerHTML =
      `<option value="">All months in ${escapeHtml(y)}</option>` +
      mks.map((mk) => `<option value="${escapeHtml(mk)}">${escapeHtml(monthLabelFromKey(mk))}</option>`).join("");
  }

  yearSel.onchange = () => {
    syncMonthSelect();
    renderByDayFiltered();
  };
  monthSel.onchange = () => renderByDayFiltered();

  syncMonthSelect();
  nav.hidden = false;
}

function renderByDayFiltered() {
  const ctx = state.byDayContext;
  if (!ctx) return;

  const yearSel = document.getElementById("byDayNavYear");
  const monthSel = document.getElementById("byDayNavMonth");
  const year = yearSel?.value ?? "";
  const monthKey = monthSel && !monthSel.disabled ? monthSel.value ?? "" : "";

  const filtered = filterByDayForSelection(ctx.fullByDay, year, monthKey);
  const body = clearBody("byDayBody");

  if (filtered.length === 0) {
    setStatsTableHeader("byDayTable", ["Date", "Games"], [], { includeDetails: true });
    appendEmptyRow(body, colCountStatsTable(2, 0, true), "No days match the selected year and month.");
    return;
  }

  const handicaps = collectHandicaps(filtered);
  setStatsTableHeader("byDayTable", ["Date", "Games"], handicaps, { includeDetails: true });
  const mainColspan = colCountStatsTable(2, handicaps.length, true);
  const gameList = Array.isArray(ctx.games) && ctx.canDetail ? ctx.games : null;

  const monthOrder = [];
  const monthMap = new Map();
  for (const row of filtered) {
    const mk = monthKeyFromDate(row.date);
    if (!monthMap.has(mk)) {
      monthMap.set(mk, []);
      monthOrder.push(mk);
    }
    monthMap.get(mk).push(row);
  }
  monthOrder.sort((a, b) => b.localeCompare(a));

  for (const mk of monthOrder) {
    const monthRows = monthMap.get(mk) || [];
    const sep = document.createElement("tr");
    sep.className = "month-heading-row";
    sep.innerHTML = `<td colspan="${mainColspan}"><h3 class="month-heading" id="by-day-${escapeHtml(mk)}">${escapeHtml(monthLabelFromKey(mk))}</h3></td>`;
    body.appendChild(sep);

    for (const row of monthRows) {
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

      const dateStr = String(row.date || "");
      const subset =
        gameList && dateStr ? gameList.filter((g) => String(g.date || "") === dateStr) : [];
      const playerRows = subset.length ? aggregateOpponentRowsWithHandicaps(subset, ctx.botId) : [];
      const detailHtml = gameList
        ? buildPlayerDetailTableHtmlWithHandicaps(playerRows)
        : '<p class="is-empty">Per-player details require individual game records in the stats payload.</p>';

      const tr = document.createElement("tr");
      tr.className = "data-row";
      tr.innerHTML = `
        <td>${escapeHtml(row.date || "-")}</td>
        <td>${totals.games}</td>
        ${cellsStatsModeBlock(row.by_handicap, handicaps, totals)}
        <td><button class="details-toggle" type="button">View</button></td>
      `;
      body.appendChild(tr);

      const detailTr = document.createElement("tr");
      detailTr.className = "details-row";
      detailTr.hidden = true;
      detailTr.innerHTML = `
        <td colspan="${mainColspan}">
          <div class="details-card">
            <h3>By player</h3>
            <div class="table-wrap">${detailHtml}</div>
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
}

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

/** Column count: leading cols + H… + Total + [Details] (one metric set per global toggle). */
function colCountStatsTable(firstColumnCount, handicapsLength, includeDetails) {
  return firstColumnCount + handicapsLength + 1 + (includeDetails ? 1 : 0);
}

function statsModeGroupTitle(mode) {
  return mode === "rate" ? "Win rate" : "W/L";
}

function statsModeTotalTitle(mode) {
  return mode === "rate" ? "Total WR" : "Total W/L";
}

function setStatsTableHeader(tableId, firstLabels, handicaps, options = {}) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const thead = table.querySelector("thead");
  if (!thead) return;
  thead.innerHTML = theadInnerHtmlStatsMode(firstLabels, handicaps, options);
}

function theadInnerHtmlStatsMode(firstLabels, handicaps, options = {}) {
  const mode = options.statsDisplayMode ?? state.statsDisplayMode ?? "wl";
  const includeDetails = options.includeDetails === true;
  const h = handicaps.length;
  const firstRow = firstLabels.map((lab) => `<th rowspan="2" scope="col">${escapeHtml(lab)}</th>`).join("");
  const detailTh = includeDetails ? '<th rowspan="2" scope="col">Details</th>' : "";
  if (h === 0) {
    return `
      <tr>
        ${firstRow}
        <th scope="col">${escapeHtml(statsModeTotalTitle(mode))}</th>
        ${detailTh}
      </tr>
    `;
  }
  const hSub = handicaps.map((x) => `<th scope="col" class="hc-sub">H${escapeHtml(x)}</th>`).join("");
  return `
    <tr>
      ${firstRow}
      <th colspan="${h}" scope="colgroup">${escapeHtml(statsModeGroupTitle(mode))}</th>
      <th rowspan="2" scope="col">${escapeHtml(statsModeTotalTitle(mode))}</th>
      ${detailTh}
    </tr>
    <tr>${hSub}</tr>
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

function renderHandicapWinRateCells(byHandicap, handicaps) {
  return handicaps
    .map((handicap) => {
      const row = byHandicap?.[handicap];
      const { wins, losses } = getWinLoss(row);
      return renderRate(wins, losses);
    })
    .join("");
}

/** Data cells for one mode: either W/L or win rate (matches global toggle). */
function cellsStatsModeBlock(byHandicap, handicaps, totals, mode = state.statsDisplayMode) {
  if (handicaps.length === 0) {
    return mode === "rate"
      ? renderRate(totals.wins, totals.losses)
      : renderWinLoss(totals.wins, totals.losses);
  }
  if (mode === "rate") {
    return `${renderHandicapWinRateCells(byHandicap, handicaps)}${renderRate(totals.wins, totals.losses)}`;
  }
  return `${renderHandicapCells(byHandicap, handicaps)}${renderWinLoss(totals.wins, totals.losses)}`;
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

function renderByDay(byDay, games, botId, canDetail) {
  const nav = document.getElementById("byDayMonthNav");
  if (!Array.isArray(byDay) || byDay.length === 0) {
    state.byDayContext = null;
    if (nav) nav.hidden = true;
    const body = clearBody("byDayBody");
    setStatsTableHeader("byDayTable", ["Date", "Games"], [], { includeDetails: false });
    appendEmptyRow(body, colCountStatsTable(2, 0, false), "No by-day data.");
    return;
  }

  state.byDayContext = {
    fullByDay: byDay,
    games,
    botId,
    canDetail,
  };

  initByDayYearMonthFilters(byDay);
  renderByDayFiltered();
}

function renderByRank(byRank, games, botId, canDetail) {
  const body = clearBody("byRankBody");
  if (!Array.isArray(byRank) || byRank.length === 0) {
    setStatsTableHeader("byRankTable", ["Rank", "Games"], [], { includeDetails: false });
    appendEmptyRow(body, colCountStatsTable(2, 0, false), "No by-rank data.");
    return;
  }
  const handicaps = collectHandicaps(byRank);
  setStatsTableHeader("byRankTable", ["Rank", "Games"], handicaps, { includeDetails: true });
  const mainColspan = colCountStatsTable(2, handicaps.length, true);
  const gameList = Array.isArray(games) && canDetail ? games : null;

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

    const rankStr = String(row.rank || "?").trim();
    const subset = gameList
      ? gameList.filter((g) => String(g.rank || "?").trim() === rankStr)
      : [];
    const playerRows = subset.length ? aggregateOpponentRowsWithHandicaps(subset, botId) : [];
    const detailHtml = gameList
      ? buildPlayerDetailTableHtmlWithHandicaps(playerRows)
      : '<p class="is-empty">Per-player details require individual game records in the stats payload.</p>';

    const tr = document.createElement("tr");
    tr.className = "data-row";
    tr.innerHTML = `
      <td>${escapeHtml(row.rank || "-")}</td>
      <td>${totals.games}</td>
      ${cellsStatsModeBlock(row.by_handicap, handicaps, totals)}
      <td><button class="details-toggle" type="button">View</button></td>
    `;
    body.appendChild(tr);

    const detailTr = document.createElement("tr");
    detailTr.className = "details-row";
    detailTr.hidden = true;
    detailTr.innerHTML = `
      <td colspan="${mainColspan}">
        <div class="details-card">
          <h3>By player</h3>
          <div class="table-wrap">${detailHtml}</div>
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

function opponentRowHandicap(row) {
  if (row.by_handicap && Object.keys(row.by_handicap).length) {
    return row.by_handicap;
  }
  const details = row.games_detail || row.gamesDetail || [];
  return details.length ? handicapBreakdownFromDetails(details) : {};
}

function renderByOpponent(byOpponent) {
  const body = clearBody("byOpponentBody");
  const table = document.getElementById("byOpponentTable");
  const theadEl = table?.querySelector("thead");
  if (!Array.isArray(byOpponent) || byOpponent.length === 0) {
    if (theadEl) {
      theadEl.innerHTML = theadInnerHtmlStatsMode(["Opponent", "Rank", "Games"], [], { includeDetails: true });
    }
    appendEmptyRow(body, colCountStatsTable(3, 0, true), "No by-opponent data.");
    return;
  }
  const sorted = [...byOpponent].sort((a, b) => {
    const byRank = compareRankValues(a.rank, b.rank);
    if (byRank !== 0) return byRank;
    return (b.games || 0) - (a.games || 0);
  });
  const handicaps = collectHandicaps(
    sorted.map((row) => ({ by_handicap: opponentRowHandicap(row) }))
  );
  const mainColspan = colCountStatsTable(3, handicaps.length, true);
  if (theadEl) {
    theadEl.innerHTML = theadInnerHtmlStatsMode(["Opponent", "Rank", "Games"], handicaps, { includeDetails: true });
  }
  for (const row of sorted) {
    const byHandicap = opponentRowHandicap(row);
    const byDate =
      row.by_date ||
      row.byDate ||
      summarizeByDateFromGameDetails(row.games_detail || row.gamesDetail || []);
    const detailByDateRows = normalizeByDateRows(byDate);
    const detailHandicaps = collectHandicaps(detailByDateRows);
    const detailColspan = colCountStatsTable(2, detailHandicaps.length, false);
    const detailRows = detailByDateRows
      .map((dateRow) => {
        const summary = totalsFromByHandicap(dateRow.by_handicap);
        return `
          <tr>
            <td>${escapeHtml(dateRow.date)}</td>
            <td>${summary.games}</td>
            ${cellsStatsModeBlock(dateRow.by_handicap, detailHandicaps, summary)}
          </tr>
        `;
      })
      .join("");

    const tr = document.createElement("tr");
    const rowTotals = { wins: row.wins || 0, losses: row.losses || 0 };
    tr.innerHTML = `
      <td>${escapeHtml(row.opponent || "-")}</td>
      <td>${escapeHtml(row.rank || "-")}</td>
      <td>${row.games || 0}</td>
      ${cellsStatsModeBlock(byHandicap, handicaps, rowTotals)}
      <td><button class="details-toggle" type="button">View</button></td>
    `;
    body.appendChild(tr);

    const detailTr = document.createElement("tr");
    detailTr.className = "details-row";
    detailTr.hidden = true;
    detailTr.innerHTML = `
      <td colspan="${mainColspan}">
        <div class="details-card">
          <h3>By date and handicap</h3>
          <div class="table-wrap">
            <table>
              <thead>
                ${theadInnerHtmlStatsMode(["Date", "Games"], detailHandicaps, { includeDetails: false })}
              </thead>
              <tbody>
                ${
                  detailRows ||
                  `<tr><td colspan="${detailColspan}" class="is-empty">No by-date handicap breakdown.</td></tr>`
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

function setSummaryLine(rank, gameCount, botId, options = {}) {
  const el = document.getElementById("statusLine");
  if (!el) return;
  const rankText = rank ? `#${rank}` : "#-";
  const applied = options.appliedFilters === true;
  const since = applied ? STATS_SINCE_BY_BOT[botId] : undefined;
  const sinceText = since ? ` since ${escapeHtml(formatSinceDate(since))}` : "";
  el.innerHTML = `The bot ranks ${rankText} on the <a href="https://www.gokgs.com/top100.jsp" target="_blank" rel="noreferrer">Top KGS 100 chart</a>. Stats based on ${gameCount} games${sinceText} for ${escapeHtml(botId)}.`;
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

  const botsPath = window.location.pathname.startsWith("/preview/") ? "/preview/bots.json" : "/bots.json";
  try {
    const response = await fetch(botsPath, { cache: "no-store", headers: { Accept: "application/json" } });
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

function refreshStatsTables() {
  if (!state.data) return;
  const botId = state.botId;
  const canRebuild = gamesArrayIsRebuildable(state.data.games);
  if (state.byDayContext) {
    renderByDayFiltered();
  } else {
    renderByDay(state.data.by_day, state.data.games, botId, canRebuild);
  }
  renderByRank(state.data.by_rank_handicap, state.data.games, botId, canRebuild);
  renderByOpponent(state.data.by_opponent);
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
    const canRebuild = gamesArrayIsRebuildable(payload.games);
    const filtered = applyStatsFilters(payload, botId);
    state.data = filtered;
    const rank = getTopRank(filtered);
    renderByDay(filtered.by_day, filtered.games, botId, canRebuild);
    renderByRank(filtered.by_rank_handicap, filtered.games, botId, canRebuild);
    renderByOpponent(filtered.by_opponent);
    updateTime();
    setSummaryLine(rank, filtered.games?.length || 0, botId, { appliedFilters: canRebuild });
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
  const modeSel = document.getElementById("statsDisplayMode");
  if (modeSel) {
    modeSel.value = state.statsDisplayMode;
    modeSel.addEventListener("change", () => {
      state.statsDisplayMode = modeSel.value === "rate" ? "rate" : "wl";
      refreshStatsTables();
    });
  }
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
