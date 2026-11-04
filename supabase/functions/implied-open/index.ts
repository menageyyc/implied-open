// Read-only relay: fetches index closes and index futures from Yahoo Finance's
// public chart feed and returns them with CORS headers so a browser page can
// read them. Symbols are fixed, so this cannot be used as an open proxy.
// The Nasdaq Composite has no futures contract; it is paired with Nasdaq-100
// futures, which the page applies as a percentage stand-in.
// Deployed to Supabase project "Menage" with verify_jwt = false.
const PAIRS = [
  { key: "spx", name: "S&P 500", index: "^GSPC", future: "ES=F" },
  { key: "ndx", name: "Nasdaq-100", index: "^NDX", future: "NQ=F" },
  { key: "ixic", name: "Nasdaq Composite", index: "^IXIC", future: "NQ=F" },
  { key: "dji", name: "Dow Jones", index: "^DJI", future: "YM=F" },
];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

async function chart(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`);
  const j = await res.json();
  const r = j?.chart?.result?.[0];
  if (!r) throw new Error(`${symbol}: no data`);
  const m = r.meta;
  const ts: number[] = r.timestamp ?? [];
  const q = r.indicators?.quote?.[0] ?? {};
  const bars = ts
    .map((t, i) => ({ t, open: q.open?.[i] ?? null, close: q.close?.[i] ?? null }))
    .filter((b) => b.close != null);
  return {
    symbol: m.symbol,
    label: m.shortName ?? m.symbol,
    price: m.regularMarketPrice,
    time: m.regularMarketTime,
    changePercent: m.regularMarketChangePercent ?? null,
    bars,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const cache = new Map<string, Promise<Awaited<ReturnType<typeof chart>>>>();
    const get = (s: string) => { if (!cache.has(s)) cache.set(s, chart(s)); return cache.get(s)!; };
    const out = await Promise.all(
      PAIRS.map(async (p) => {
        const [idx, fut] = await Promise.all([get(p.index), get(p.future)]);
        return { key: p.key, name: p.name, index: idx, future: fut };
      }),
    );
    return new Response(JSON.stringify({ fetchedAt: Date.now(), source: "Yahoo Finance", pairs: out }), {
      headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=30", "X-Robots-Tag": "noindex, nofollow" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 502,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
