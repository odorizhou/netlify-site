const state = {
  botId: "gh204",
  data: null,
};

function toPct(wins, losses) {
  const total = wins + losses;
  if (!total) return "-";
  return `${((wins / total) * 100).toFixed(1)}%`;
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
  for (const row of byDay) {
    const totals = sumByHandicap(row.by_handicap, "botWins", "botLosses");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.date || "-"}</td>
      <td>${totals.games}</td>
      <td>${totals.wins}</td>
      <td>${totals.losses}</td>
      <td>${toPct(totals.wins, totals.losses)}</td>
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
  for (const row of byRank) {
    const totals = sumByHandicap(row.by_handicap, "wins", "losses");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.rank || "-"}</td>
      <td>${totals.games}</td>
      <td>${totals.wins}</td>
      <td>${totals.losses}</td>
      <td>${toPct(totals.wins, totals.losses)}</td>
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
  for (const row of byOpponent) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.opponent || "-"}</td>
      <td>${row.rank || "-"}</td>
      <td>${row.games || 0}</td>
      <td>${row.wins || 0}</td>
      <td>${row.losses || 0}</td>
      <td>${toPct(row.wins || 0, row.losses || 0)}</td>
    `;
    body.appendChild(tr);
  }
}

function setStatus(text) {
  document.getElementById("statusLine").textContent = text;
}

function updateTime() {
  document.getElementById("year").textContent = new Date().getFullYear();
  document.getElementById("lastUpdated").textContent = new Date().toLocaleString();
}

async function loadStats() {
  const botId = state.botId.trim();
  if (!botId) {
    setStatus("Bot ID is required.");
    return;
  }
  setStatus(`Loading stats for ${botId}...`);
  try {
    const response = await fetch(`/.netlify/functions/stats?botId=${encodeURIComponent(botId)}`, {
      headers: { Accept: "application/json" },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || `Request failed with ${response.status}`);
    }
    state.data = payload;
    renderByDay(payload.by_day);
    renderByRank(payload.by_rank_handicap);
    renderByOpponent(payload.by_opponent);
    updateTime();
    setStatus(`Showing ${payload.games?.length || 0} games for ${botId}.`);
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
  const input = document.getElementById("botIdInput");
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
  const input = document.getElementById("botIdInput");
  if (fromQuery) {
    state.botId = fromQuery;
    input.value = fromQuery;
  } else {
    state.botId = input.value.trim();
  }
  bindEvents();
  loadStats();
}

init();
