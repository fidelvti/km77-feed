const BASE_URL = "https://www.km77.com";
const PAGE_PATHS = ["/", "/page/2"];
const FEED_TITLE = "km77 - Portada (noticias y novedades)";
const FEED_LINK = `${BASE_URL}/`;
const FEED_DESCRIPTION =
  "Feed no oficial generado a partir de la portada de km77.com: " +
  "noticias, pruebas y novedades de modelos";
const FEED_SELF_URL = "https://fidelvti.github.io/km77-feed/feed.xml?v=5";
const HUB_URL = "https://pubsubhubbub.appspot.com/";
const MAX_ITEMS = 40;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const GITHUB_REPO = "fidelvti/km77-feed";
const GITHUB_BRANCH = "main";
const FEED_PATH = "docs/feed.xml";
const INDEX_PATH = "docs/index.html";
const KV_SEEN_KEY = "seen_links";

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatRfc2822(date) {
  return date.toUTCString().replace("GMT", "+0000");
}

function parseRelativeDate(text, now) {
  const t = text.trim().toLowerCase();
  let m = t.match(/hace (\d+) minuto/);
  if (m) return new Date(now.getTime() - Number(m[1]) * 60 * 1000);
  m = t.match(/hace (\d+) hora/);
  if (m) return new Date(now.getTime() - Number(m[1]) * 60 * 60 * 1000);
  m = t.match(/hace (\d+) d[ií]a/);
  if (m) return new Date(now.getTime() - Number(m[1]) * 24 * 60 * 60 * 1000);
  m = t.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) {
    const [, day, month, year] = m;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0));
  }
  return now;
}

async function fetchHtml(path) {
  const resp = await fetch(BASE_URL + path, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!resp.ok) {
    throw new Error(`Fetch ${path} failed: HTTP ${resp.status}`);
  }
  return resp;
}

// Parses km77's homepage card markup into structured items using HTMLRewriter.
// Cards are <li class="js-relocation-destination">, each containing an
// <a class="order-3 ..."> that wraps an <h2> title, a <p class="publish-date">,
// and a <p class="summary">. Scoping the selectors under
// "li.js-relocation-destination" avoids matching unrelated Bootstrap
// "order-3" classes elsewhere on the page.
async function parseItems(resp, now) {
  const items = [];

  const rewriter = new HTMLRewriter()
    .on("li.js-relocation-destination", {
      element() {
        items.push({ title: "", link: "", dateText: "", description: "" });
      },
    })
    .on("li.js-relocation-destination a.order-3", {
      element(el) {
        const current = items[items.length - 1];
        if (current && !current.link) {
          const href = el.getAttribute("href");
          if (href) current.link = new URL(href, BASE_URL).toString();
        }
      },
    })
    .on("li.js-relocation-destination a.order-3 h2", {
      text(chunk) {
        const current = items[items.length - 1];
        if (current) current.title += chunk.text;
      },
    })
    .on("li.js-relocation-destination a.order-3 p.publish-date", {
      text(chunk) {
        const current = items[items.length - 1];
        if (current) current.dateText += chunk.text;
      },
    })
    .on("li.js-relocation-destination a.order-3 p.summary", {
      text(chunk) {
        const current = items[items.length - 1];
        if (current) current.description += chunk.text;
      },
    });

  // Draining the transformed body is what actually drives the handlers.
  await rewriter.transform(resp).arrayBuffer();

  return items
    .map((item) => ({
      title: item.title.trim(),
      link: item.link,
      description: item.description.trim(),
      pubDate: parseRelativeDate(item.dateText, now),
    }))
    .filter((item) => item.title && item.link);
}

async function fetchAllItems() {
  const now = new Date();
  const seen = new Set();
  const items = [];

  for (const path of PAGE_PATHS) {
    const resp = await fetchHtml(path);
    for (const item of await parseItems(resp, now)) {
      if (seen.has(item.link)) continue;
      seen.add(item.link);
      items.push(item);
    }
  }

  items.sort((a, b) => b.pubDate - a.pubDate);
  return items.slice(0, MAX_ITEMS);
}

function buildRss(items) {
  const entries = items
    .map(
      (item) => `
    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="true">${escapeXml(item.link)}</guid>
      <pubDate>${formatRfc2822(item.pubDate)}</pubDate>
      <description>${escapeXml(item.description)}</description>
    </item>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(FEED_TITLE)}</title>
    <link>${escapeXml(FEED_LINK)}</link>
    <description>${escapeXml(FEED_DESCRIPTION)}</description>
    <language>es-ES</language>
    <lastBuildDate>${formatRfc2822(new Date())}</lastBuildDate>
    <atom:link rel="self" type="application/rss+xml" href="${escapeXml(FEED_SELF_URL)}" />
    <atom:link rel="hub" href="${escapeXml(HUB_URL)}" />${entries}
  </channel>
</rss>
`;
}

function buildIndexHtml() {
  const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>km77 feed</title>
<link rel="alternate" type="application/rss+xml" title="km77 - Revista (noticias y novedades)" href="feed.xml">
</head>
<body>
<h1>Feed no oficial de km77.com</h1>
<p>Generado autom&aacute;ticamente a partir de la revista de km77.com. No es un feed oficial del sitio.</p>
<p><a href="feed.xml">feed.xml</a></p>
<p>&Uacute;ltima actualizaci&oacute;n: ${timestamp}</p>
</body>
</html>
`;
}

function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function githubRequest(env, path, options = {}) {
  const resp = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "km77-feed-worker",
      Accept: "application/vnd.github+json",
      ...(options.headers || {}),
    },
  });
  return resp;
}

async function putGithubFile(env, path, content, message) {
  const getResp = await githubRequest(
    env,
    `/repos/${GITHUB_REPO}/contents/${path}?ref=${GITHUB_BRANCH}`
  );
  let sha;
  if (getResp.status === 200) {
    sha = (await getResp.json()).sha;
  } else if (getResp.status !== 404) {
    throw new Error(`GET ${path} failed: HTTP ${getResp.status}`);
  }

  const putResp = await githubRequest(env, `/repos/${GITHUB_REPO}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: toBase64Utf8(content),
      branch: GITHUB_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!putResp.ok) {
    throw new Error(`PUT ${path} failed: HTTP ${putResp.status}: ${await putResp.text()}`);
  }
}

async function dispatchNotifyEvent(env, newItems) {
  if (newItems.length === 0) return;
  const resp = await githubRequest(env, `/repos/${GITHUB_REPO}/dispatches`, {
    method: "POST",
    body: JSON.stringify({
      event_type: "new-items",
      client_payload: {
        items: newItems.map(({ title, link, description }) => ({ title, link, description })),
      },
    }),
  });
  if (!resp.ok) {
    throw new Error(`repository_dispatch failed: HTTP ${resp.status}: ${await resp.text()}`);
  }
}

async function pingHub() {
  try {
    const resp = await fetch(HUB_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ "hub.mode": "publish", "hub.url": FEED_SELF_URL }),
    });
    return resp.status;
  } catch (e) {
    return `error: ${e}`;
  }
}

async function runPipeline(env) {
  const log = [];

  const items = await fetchAllItems();
  if (items.length === 0) {
    throw new Error("No items parsed, aborting to avoid overwriting feed with empty content");
  }
  log.push(`Parsed ${items.length} items`);

  const rss = buildRss(items);
  const indexHtml = buildIndexHtml();
  await putGithubFile(env, FEED_PATH, rss, `Update feed ${new Date().toISOString()}`);
  await putGithubFile(env, INDEX_PATH, indexHtml, `Update index ${new Date().toISOString()}`);
  log.push("Pushed docs/feed.xml and docs/index.html to GitHub");

  const seenRaw = await env.SEEN_LINKS.get(KV_SEEN_KEY);
  const currentLinks = items.map((i) => i.link);

  if (seenRaw === null) {
    log.push("No previous state found, bootstrapping without sending pushes");
  } else {
    const seen = new Set(JSON.parse(seenRaw));
    const newItems = items.filter((i) => !seen.has(i.link));
    await dispatchNotifyEvent(env, newItems);
    log.push(`Dispatched notify event for ${newItems.length} new item(s)`);
  }

  await env.SEEN_LINKS.put(KV_SEEN_KEY, JSON.stringify(currentLinks));

  const hubStatus = await pingHub();
  log.push(`Pinged hub: ${hubStatus}`);

  return log;
}

export default {
  async fetch(request, env) {
    try {
      const log = await runPipeline(env);
      return new Response(log.join("\n") + "\n", { status: 200 });
    } catch (e) {
      return new Response(`ERROR: ${e.stack || e}\n`, { status: 500 });
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runPipeline(env));
  },
};
