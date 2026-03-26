const DEFAULT_TIMEOUT_MS = 15000;

function json(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Stats update infrequently; allow short CDN caching while keeping it reasonably fresh.
      "Cache-Control": "public, max-age=60, s-maxage=300",
    },
  });
}

function requireEnv(name) {
  const value = (process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function decodeBase64Utf8(input) {
  // GitHub Contents API returns base64 with line breaks sometimes.
  const normalized = String(input || "").replace(/\s+/g, "");
  return Buffer.from(normalized, "base64").toString("utf8");
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export default async (request) => {
  try {
    const url = new URL(request.url);
    const botId = (url.searchParams.get("botId") || "").trim();
    if (!botId) return json(400, { error: "Missing botId query parameter." });

    const repo = requireEnv("STATS_GITHUB_REPO"); // e.g. "owner/repo"
    const token = requireEnv("STATS_GITHUB_TOKEN"); // fine-grained PAT with read access to repo contents
    const branch = (process.env.STATS_GITHUB_BRANCH || "main").trim() || "main";
    const pathTemplate = (process.env.STATS_GITHUB_PATH_TEMPLATE || "stats/{botId}.json").trim();

    const path = pathTemplate.replaceAll("{botId}", botId);
    const apiUrl =
      `https://api.github.com/repos/${repo}/contents/${path}` + `?ref=${encodeURIComponent(branch)}`;

    const upstream = await fetchWithTimeout(apiUrl, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "netlify-site-stats-proxy",
      },
    });

    const text = await upstream.text();
    let gh;
    try {
      gh = text ? JSON.parse(text) : {};
    } catch {
      return json(502, { error: "GitHub returned non-JSON response.", status: upstream.status });
    }

    if (!upstream.ok) {
      return json(upstream.status || 502, {
        error: gh?.message || "Failed to fetch stats from GitHub.",
      });
    }

    if (!gh || gh.type !== "file" || typeof gh.content !== "string") {
      return json(502, { error: "GitHub response did not include file content." });
    }

    let data;
    try {
      data = JSON.parse(decodeBase64Utf8(gh.content));
    } catch {
      return json(502, { error: "Stats file is not valid JSON." });
    }

    return json(200, data);
  } catch (error) {
    if (error.name === "AbortError") {
      return json(504, { error: "Stats request timed out." });
    }
    return json(500, { error: `Unexpected error: ${error.message}` });
  }
};
