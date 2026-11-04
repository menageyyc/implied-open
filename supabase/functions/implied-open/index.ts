// Read-only relay: fetches index closes, index futures and a few market drivers
// from Yahoo Finance's public chart feed, plus the Government of Canada 10-year
// benchmark yield from the Bank of Canada's Valet API, and returns them with
// CORS headers so a browser page can read them. Symbols are fixed, so this
// cannot be used as an open proxy.
// Proxies: the Nasdaq Composite uses Nasdaq-100 futures and the S&P/TSX
// Composite uses S&P 500 futures (no free source for Canadian index futures);
// the page applies the futures' percentage move.
// Deployed to Supabase project "Menage" with verify_jwt = false.
// Futures are requested as one specific quarterly contract (e.g. ESZ26.CME), chosen by date, not
// Yahoo's continuous ES=F series: around each expiry that series' live price moves to the next
// contract days before its daily closes do, which pushed estimates about 1% too high.
const PAIRS = [
  { key: "spx", name: "S&P 500", index: "^GSPC", future: "ES" },
  { key: "ndx", name: "Nasdaq-100", index: "^NDX", future: "NQ" },
  { key: "ixic", name: "Nasdaq Composite", index: "^IXIC", future: "NQ" },
  { key: "dji", name: "Dow Jones", index: "^DJI", future: "YM" },
  { key: "tsx", name: "S&P/TSX Composite", index: "^GSPTSE", future: "ES" },
];
const EXCHANGE: Record<string, string> = { ES: "CME", NQ: "CME", YM: "CBT" };

// Eastern date (YYYY-MM-DD) of the next open the page is estimating: today until the 4 p.m. close,
// otherwise the next weekday.
function targetDate(ms: number) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day, 12));
  const weekend = (x: Date) => x.getUTCDay() === 0 || x.getUTCDay() === 6;
  if (weekend(d) || +p.hour >= 16) do d.setUTCDate(d.getUTCDate() + 1); while (weekend(d));
  return d.toISOString().slice(0, 10);
}
// The quarterly contract to use for a given open. Contracts expire on the 3rd Friday of
// Mar/Jun/Sep/Dec; switch to the next one from the Monday of expiry week (when trading moves).
// The live price and the reference close always come from this same contract.
function contractFor(root: string, target: string) {
  const y0 = +target.slice(0, 4);
  for (let y = y0; y <= y0 + 1; y++) {
    for (const m of [3, 6, 9, 12]) {
      const firstDay = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
      const thirdFriday = 1 + ((5 - firstDay + 7) % 7) + 14;
      const rollDate = new Date(Date.UTC(y, m - 1, thirdFriday - 4)).toISOString().slice(0, 10);
      if (target < rollDate) return `${root}${"HMUZ"[m / 3 - 1]}${String(y % 100).padStart(2, "0")}.${EXCHANGE[root]}`;
    }
  }
  throw new Error(`no contract for ${target}`);
}

const DRIVERS = [
  { key: "oil", name: "Crude oil (WTI)", symbol: "CL=F" },
  { key: "gas", name: "Natural gas", symbol: "NG=F" },
  { key: "gold", name: "Gold", symbol: "GC=F" },
  { key: "cad", name: "Canadian dollar (US$)", symbol: "CADUSD=X" },
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

async function canada10y() {
  const res = await fetch("https://www.bankofcanada.ca/valet/observations/BD.CDN.10YR.DQ.YLD/json?recent=2");
  if (!res.ok) throw new Error(`Bank of Canada: HTTP ${res.status}`);
  const obs = (await res.json())?.observations ?? [];
  const v = (o: any) => parseFloat(o?.["BD.CDN.10YR.DQ.YLD"]?.v);
  if (obs.length < 2) throw new Error("Bank of Canada: not enough data");
  return { date: obs[0].d, value: v(obs[0]), prevDate: obs[1].d, prev: v(obs[1]) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const cache = new Map<string, Promise<Awaited<ReturnType<typeof chart>>>>();
    const get = (s: string) => { if (!cache.has(s)) cache.set(s, chart(s)); return cache.get(s)!; };
    const target = targetDate(Date.now());
    // Specific contract first; if Yahoo ever stops serving it, fall back to the continuous series
    // (correct except in the days around an expiry).
    // Retried on every request, so it recovers by itself as soon as Yahoo serves the contract again.
    // `fallback: true` tells the page to show a warning.
    const future = (root: string) => {
      const contract = contractFor(root, target);
      return get(contract).then((f) => ({ ...f, contract, fallback: false }))
        .catch(() => get(`${root}=F`).then((f) => ({ ...f, contract, fallback: true })));
    };
    const [pairs, drivers, bond] = await Promise.all([
      Promise.all(PAIRS.map(async (p) => {
        const [idx, fut] = await Promise.all([get(p.index), future(p.future)]);
        return { key: p.key, name: p.name, index: idx, future: fut };
      })),
      Promise.all(DRIVERS.map(async (d) => {
        try {
          const c = await get(d.symbol);
          const prev = c.bars.length > 1 ? c.bars[c.bars.length - 2].close : null;
          const changePercent = prev ? ((c.price - prev) / prev) * 100 : c.changePercent;
          return { key: d.key, name: d.name, symbol: d.symbol, label: c.label, price: c.price, time: c.time, changePercent };
        } catch (e) {
          return { key: d.key, name: d.name, symbol: d.symbol, error: String((e as Error).message ?? e) };
        }
      })),
      canada10y().catch((e) => ({ error: String((e as Error).message ?? e) })),
    ]);
    return new Response(JSON.stringify({ fetchedAt: Date.now(), source: "Yahoo Finance; Bank of Canada", pairs, drivers, canada10y: bond }), {
      headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=30", "X-Robots-Tag": "noindex, nofollow" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 502,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
