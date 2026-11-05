// /api/sxf: Montréal Exchange SXF (S&P/TSX 60 futures), front-month contract, for the Implied Open page.
// Cloudflare Pages Function on the PUBLIC project `implied-open` (root dir = repo root, so Pages serves /functions).
//
// Permission: TMX Montréal Exchange granted non-commercial use of live and delayed SXF data for
// https://implied-open.soesraider.com/ (notes/mx-permission-reply.md), on condition that crawlers and
// scrapers are blocked. So this endpoint:
//   - answers only on this project's own hostnames (the custom domain and *.implied-open.pages.dev previews);
//   - answers only same-origin browser requests (Sec-Fetch-Site: same-origin), or the accuracy logger,
//     which sends the shared secret SXF_LOGGER_KEY (Pages env var; same value in Supabase Vault as
//     implied_open_sxf_key) in the x-sxf-key header;
//   - is never cached by browsers or proxies and carries X-Robots-Tag (robots.txt also disallows everything);
//   - fetches m-x.ca at most about once a minute per Cloudflare location, however many tabs are open.
// Cloudflare rules on the hostname add a known-bot block and a rate limit (see HANDOFF.md).
// This makes scraping hard, not impossible: a real browser can still read the rendered page.
// Never use MX data in any other project. Never move this fetch into the Supabase relay (its URL is public and keyless).

const SOURCE = "https://www.m-x.ca/en/trading/data/quotes?symbol=SXF";
const CACHE_SECONDS = 60;
const HOSTS = ["implied-open.soesraider.com", "implied-open.pages.dev"];
const okHost = (h) => HOSTS.includes(h) || h.endsWith(".implied-open.pages.dev");

const HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store, private",
  "x-robots-tag": "noindex, nofollow, noarchive",
  "x-content-type-options": "nosniff",
};
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: HEADERS });
const refuse = () => new Response("Not found", { status: 404, headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });

const unescapeHtml = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// Each contract row on the MX quote page has a data-row attribute holding HTML-escaped JSON.
export function parse(html) {
  const rows = [];
  const re = /data-row='([^']+)'/g;
  let m;
  while ((m = re.exec(html))) {
    try {
      const o = JSON.parse(unescapeHtml(m[1]));
      if (o && o.root_symbol === "SXF" && !o.is_option) rows.push(o);
    } catch { /* skip a row we can't read */ }
  }
  if (!rows.length) return { error: "no SXF contracts found on the Montréal Exchange page (its layout may have changed)" };
  // Front month = the contract with the most open interest; ties go to the earliest expiry (handles quarterly rolls).
  rows.sort((a, b) => (b.open_interest || 0) - (a.open_interest || 0) || String(a.expiry_date).localeCompare(String(b.expiry_date)));
  const f = rows[0];
  return {
    front: {
      symbol: f.symbol, expiry: f.expiry_date,
      last: f.last_price, bid: f.bid_price, ask: f.ask_price, settlement: f.settlement_price,
      volume: f.volume, trades: f.nb_trades, openInterest: f.open_interest,
    },
  };
}

// Constant-time string comparison (for the logger's key).
function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function allowed(request, env) {
  const url = new URL(request.url);
  if (!okHost(url.hostname)) return false;
  const key = env && env.SXF_LOGGER_KEY;
  if (key && key.length >= 32 && same(request.headers.get("x-sxf-key"), key)) return true;
  // Browsers send Sec-Fetch-Site on every request; a fetch() from the page itself says "same-origin".
  if (request.headers.get("sec-fetch-site") !== "same-origin") return false;
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return false;
  const ref = request.headers.get("referer");
  if (ref) { try { if (new URL(ref).origin !== url.origin) return false; } catch { return false; } }
  return true;
}

// Short-lived copy of the parsed quote: in this server's memory, and in Cloudflare's cache for this
// location (the Cache API works on the custom domain; on *.pages.dev it quietly does nothing).
let memo = null;
async function quote(waitUntil) {
  const now = Date.now();
  if (memo && now - memo.fetchedAt < CACHE_SECONDS * 1000) return memo;
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheKey = new Request("https://implied-open.soesraider.com/__cache/sxf-quote");
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) { const o = await hit.json(); if (now - o.fetchedAt < CACHE_SECONDS * 1000) { memo = o; return o; } }
    } catch { /* cache unavailable: fetch instead */ }
  }
  let html;
  try {
    const r = await fetch(SOURCE, { headers: { "user-agent": "Mozilla/5.0 (compatible; implied-open)", accept: "text/html" } });
    if (!r.ok) return { error: `the Montréal Exchange site answered with an error (${r.status})` };
    html = await r.text();
  } catch {
    return { error: "couldn't reach the Montréal Exchange site" };
  }
  const out = parse(html);
  if (out.error) return out;
  const o = Object.assign({ fetchedAt: now }, out);
  memo = o;
  if (cache) {
    const put = cache.put(cacheKey, new Response(JSON.stringify(o), { headers: { "content-type": "application/json", "cache-control": `max-age=${CACHE_SECONDS}` } })).catch(() => {});
    if (waitUntil) waitUntil(put);
  }
  return o;
}

export async function onRequest({ request, env, waitUntil }) {
  if (request.method !== "GET") return refuse();
  if (!allowed(request, env)) return refuse();
  const o = await quote(waitUntil);
  return o.error ? json(o, 502) : json(o);
}
