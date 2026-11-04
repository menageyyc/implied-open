// Read-only relay: fetches index closes, index futures, a few market drivers and an overnight
// context row from Yahoo Finance's public chart feed, plus the Government of Canada 10-year
// benchmark yield from the Bank of Canada's Valet API and the monthly WCS heavy-oil price from
// the Government of Alberta, and returns them with
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
  { key: "spx", name: "S&P 500", index: "^GSPC", future: "ES", cal: "us" },
  { key: "ndx", name: "Nasdaq-100", index: "^NDX", future: "NQ", cal: "us" },
  { key: "ixic", name: "Nasdaq Composite", index: "^IXIC", future: "NQ", cal: "us" },
  { key: "dji", name: "Dow Jones", index: "^DJI", future: "YM", cal: "us" },
  { key: "rut", name: "Russell 2000", index: "^RUT", future: "RTY", cal: "us" },
  { key: "tsx", name: "S&P/TSX Composite", index: "^GSPTSE", future: "ES", cal: "ca" },
] as const;
const EXCHANGE: Record<string, string> = { ES: "CME", NQ: "CME", YM: "CBT", RTY: "CME" };
const OPEN_MIN = 570; // 9:30 a.m.

// ---------- Market calendars ----------
// Full closures and 1 p.m. ET early closes. Checked 2026-11-04 against the official pages
// (nyse.com/markets/hours-calendars and tsx.com's trading calendar). The same lists are in
// site/index.html and supabase/functions/implied-open-accuracy/index.ts: change all three together.
// They end with 2027: add 2028 before then (after the last listed date, only weekends are skipped).
const CAL: Record<"us" | "ca", { closed: Record<string, string>; early: Record<string, string> }> = {
  us: {
    closed: {
      "2026-01-01": "New Year's Day", "2026-01-19": "Martin Luther King Jr. Day", "2026-02-16": "Washington's Birthday",
      "2026-04-03": "Good Friday", "2026-05-25": "Memorial Day", "2026-06-19": "Juneteenth", "2026-07-03": "Independence Day (observed)",
      "2026-09-07": "Labor Day", "2026-11-26": "Thanksgiving", "2026-12-25": "Christmas",
      "2027-01-01": "New Year's Day", "2027-01-18": "Martin Luther King Jr. Day", "2027-02-15": "Washington's Birthday",
      "2027-03-26": "Good Friday", "2027-05-31": "Memorial Day", "2027-06-18": "Juneteenth (observed)", "2027-07-05": "Independence Day (observed)",
      "2027-09-06": "Labor Day", "2027-11-25": "Thanksgiving", "2027-12-24": "Christmas (observed)",
    },
    early: { "2026-11-27": "the day after Thanksgiving", "2026-12-24": "Christmas Eve", "2027-11-26": "the day after Thanksgiving" },
  },
  ca: {
    closed: {
      "2026-01-01": "New Year's Day", "2026-02-16": "Family Day", "2026-04-03": "Good Friday", "2026-05-18": "Victoria Day",
      "2026-07-01": "Canada Day", "2026-08-03": "Civic Holiday", "2026-09-07": "Labour Day", "2026-10-12": "Thanksgiving",
      "2026-12-25": "Christmas", "2026-12-28": "Boxing Day (observed)",
      "2027-01-01": "New Year's Day", "2027-02-15": "Family Day", "2027-03-26": "Good Friday", "2027-05-24": "Victoria Day",
      "2027-07-01": "Canada Day", "2027-08-02": "Civic Holiday", "2027-09-06": "Labour Day", "2027-10-11": "Thanksgiving",
      "2027-12-27": "Christmas (observed)", "2027-12-28": "Boxing Day (observed)",
    },
    early: { "2026-12-24": "Christmas Eve", "2027-12-24": "Christmas Eve" },
  },
};
type Cal = keyof typeof CAL;
function addDays(date: string, n: number) {
  const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
function isTradingDay(cal: Cal, date: string) {
  const wd = new Date(date + "T12:00:00Z").getUTCDay();
  return wd !== 0 && wd !== 6 && !(date in CAL[cal].closed);
}
const closeMin = (cal: Cal, date: string) => (date in CAL[cal].early ? 780 : 960); // 1 p.m. or 4 p.m.
function nextTradingDay(cal: Cal, date: string) { let d = addDays(date, 1); while (!isTradingDay(cal, d)) d = addDays(d, 1); return d; }

// ---------- Eastern time (US daylight-saving rules; same code as the logger) ----------
const dstCache = new Map<number, [number, number]>();
function dst(y: number) {
  let b = dstCache.get(y);
  if (!b) {
    const mar1 = new Date(Date.UTC(y, 2, 1)).getUTCDay(), nov1 = new Date(Date.UTC(y, 10, 1)).getUTCDay();
    b = [Date.UTC(y, 2, 1 + ((7 - mar1) % 7) + 7, 7), Date.UTC(y, 10, 1 + ((7 - nov1) % 7), 6)]; dstCache.set(y, b);
  }
  return b;
}
function et(ms: number) {
  const [a, b] = dst(new Date(ms).getUTCFullYear());
  const d = new Date(ms - (ms >= a && ms < b ? 4 : 5) * 3600000);
  return { date: d.toISOString().slice(0, 10), mins: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
// UTC milliseconds of an Eastern date + minutes after midnight.
function etToMs(date: string, mins: number) {
  let guess = Date.parse(date + "T00:00:00Z") + (mins + 300) * 60000;
  for (let i = 0; i < 2; i++) {
    const e = et(guess);
    guess -= ((Date.parse(e.date + "T00:00:00Z") - Date.parse(date + "T00:00:00Z")) / 60000 + e.mins - mins) * 60000;
  }
  return guess;
}

// Eastern date of the next open the page is estimating for a market: today until its close
// (4 p.m., or 1 p.m. on an early-close day), otherwise its next trading day.
function targetDate(cal: Cal, ms: number) {
  const n = et(ms);
  return isTradingDay(cal, n.date) && n.mins < closeMin(cal, n.date) ? n.date : nextTradingDay(cal, n.date);
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

// Overnight context row (not used in any estimate): fixed symbols, fetched together in ONE Yahoo
// "spark" request (5-minute bars, last 5 days) and cached for a minute, so open tabs add at most
// one Yahoo request a minute between them. Change is measured since the last US cash close
// (4 p.m., or 1 p.m. on early-close days): the price at that moment from the 5-minute bars.
const CONTEXT = [
  { key: "vix", symbol: "^VIX" },        // S&P 500 volatility index; calculated from about 3:15 a.m. ET
  { key: "tnx", symbol: "^TNX" },        // US 10-year yield (percent); updates from about 8:20 a.m. ET
  { key: "zn", symbol: "ZN=F" },         // 10-year T-note futures (price): the overnight stand-in for the yield
  { key: "dxy", symbol: "DX-Y.NYB" },    // US dollar index
  // Europe trades about 3 a.m. to 11:30 a.m. ET, so it always closes before the US does. Its change is
  // measured from its official previous close (the closing auction), which the last 5-minute bar misses.
  { key: "stoxx", symbol: "^STOXX50E", official: true }, // Euro Stoxx 50
  { key: "dax", symbol: "^GDAXI", official: true },
  { key: "ftse", symbol: "^FTSE", official: true },
  { key: "brent", symbol: "BZ=F" },
  { key: "wti", symbol: "CL=F" },        // only for the Brent-WTI spread
  { key: "copper", symbol: "HG=F" },
] as const;
let contextCache: { at: number; data: unknown } | null = null;

// The last US cash close at or before `now` (ms), by the US calendar.
function lastUsClose(now: number) {
  let d = et(now).date;
  for (let i = 0; i < 15; i++, d = addDays(d, -1)) {
    if (isTradingDay("us", d) && etToMs(d, closeMin("us", d)) <= now) return { date: d, ms: etToMs(d, closeMin("us", d)) };
  }
  throw new Error("no US close in the last 15 days");
}

async function context(now: number) {
  if (contextCache && now - contextCache.at < 60000) return contextCache.data;
  const syms = CONTEXT.map((c) => c.symbol).join(",");
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(syms)}&range=5d&interval=5m`,
    { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`context: HTTP ${res.status}`);
  const j = await res.json();
  const close = lastUsClose(now);
  const items = CONTEXT.map((c) => {
    const s = j?.[c.symbol];
    const ts: number[] = s?.timestamp ?? [], cl: (number | null)[] = s?.close ?? [];
    let ref: number | null = null, refTime: number | null = null, price: number | null = null, time: number | null = null;
    for (let i = 0; i < ts.length; i++) {
      if (cl[i] == null) continue;
      if ((ts[i] + 300) * 1000 <= close.ms) { ref = cl[i]; refTime = ts[i] + 300; }
      price = cl[i]; time = Math.min(ts[i] + 300, Math.floor(now / 1000));
    }
    if (price == null) return { key: c.key, symbol: c.symbol, error: "no data" };
    if ("official" in c && time! * 1000 > close.ms && isFinite(s?.previousClose)) { ref = s.previousClose; refTime = null; }
    // traded = has traded since the US close; stale = no new price for 30+ minutes (closed or paused).
    return { key: c.key, symbol: c.symbol, price, time, ref, refTime,
      traded: time! * 1000 > close.ms, stale: now - time! * 1000 > 30 * 60000 };
  });
  const data = { usClose: close, items };
  contextCache = { at: now, data };
  return data;
}

// Western Canadian Select and WTI monthly averages (US$/bbl) from the Government of Alberta's
// Economic Dashboard API (no key; published about a month behind). Terms (economicdashboard.alberta.ca/disclaimer,
// checked 2026-11-04): non-commercial reproduction allowed, unmodified, with the Government of Alberta
// named as the source and not presented as an official version. Changes monthly, so cached 6 hours
// (10 minutes after a failure, keeping the last good value).
let wcsCache: { at: number; ok: boolean; data: unknown } | null = null;
async function wcs(now: number) {
  if (wcsCache && now - wcsCache.at < (wcsCache.ok ? 6 * 3600000 : 600000)) return wcsCache.data;
  try {
    const res = await fetch("https://api.economicdata.alberta.ca/data?table=OilPrices&Type=WCS;WTI");
    if (!res.ok) throw new Error(`Alberta: HTTP ${res.status}`);
    const rows: Record<string, unknown>[] = await res.json();
    const by: Record<string, { wcs?: number; wti?: number }> = {};
    for (const r of rows) {
      const type = String(r["Type"] ?? r["Type "] ?? "").trim(), month = String(r["Date"] ?? "").slice(0, 7), v = Number(r["Value"]);
      if (!/^\d{4}-\d{2}$/.test(month) || !isFinite(v) || (type !== "WCS" && type !== "WTI")) continue;
      (by[month] ??= {})[type === "WCS" ? "wcs" : "wti"] = v;
    }
    const month = Object.keys(by).filter((m) => by[m].wcs != null && by[m].wti != null).sort().pop();
    if (!month) throw new Error("Alberta: no month with both WCS and WTI");
    const data = { month, wcs: by[month].wcs, wti: by[month].wti, unit: "US$/bbl", source: "Government of Alberta, Economic Dashboard" };
    wcsCache = { at: now, ok: true, data };
    return data;
  } catch (e) {
    // Keep showing the last good month if there is one; retry in 10 minutes.
    const last = wcsCache && !(wcsCache.data as { error?: string }).error ? wcsCache.data : null;
    const data = last ?? { error: String((e as Error).message ?? e) };
    wcsCache = { at: now, ok: false, data };
    return data;
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

type Bar = { t: number; open: number | null; close: number };
// query: e.g. "range=5d&interval=1d" (only ever built in this file).
async function chart(symbol: string, query = "range=5d&interval=1d") {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`);
  const j = await res.json();
  const r = j?.chart?.result?.[0];
  if (!r) throw new Error(`${symbol}: no data`);
  const m = r.meta;
  const ts: number[] = r.timestamp ?? [];
  const q = r.indicators?.quote?.[0] ?? {};
  const bars: Bar[] = ts
    .map((t, i) => ({ t, open: q.open?.[i] ?? null, close: q.close?.[i] ?? null }))
    .filter((b) => b.close != null);
  return {
    symbol: m.symbol as string,
    label: (m.shortName ?? m.symbol) as string,
    price: m.regularMarketPrice as number,
    time: m.regularMarketTime as number,
    changePercent: (m.regularMarketChangePercent ?? null) as number | null,
    bars,
  };
}

// Futures price at a given moment: the close of the last 5-minute bar that ended by then.
function priceAt(five: Bar[], atMs: number) {
  let best: Bar | null = null;
  for (const b of five) if ((b.t + 300) * 1000 <= atMs) best = b;
  return best ? { close: best.close, time: best.t + 300 } : null;
}
// Futures reference for close dates where Yahoo's daily futures close isn't the price at the index's
// close: 1 p.m. early closes (futures trade until 1:15 p.m. and Yahoo's daily close is that 1:15 price),
// and days with no daily futures bar at all (US holidays on which the TSX trades; Yahoo leaves out
// futures' holiday sessions). Uses the futures price at the index's close time from 5-minute bars.
// Only the last two closes can be "the last close" on the page, so only those are checked.
async function futureRefs(cal: Cal, idxBars: Bar[], futSymbol: string, futBars: Bar[], now: number, five: (s: string) => Promise<Bar[]>) {
  const refs: Record<string, { close: number; time: number }> = {};
  const futDates = new Set(futBars.map((b) => et(b.t * 1000).date));
  const need = idxBars.slice(-2).map((b) => et(b.t * 1000).date)
    .filter((d) => (d in CAL[cal].early || !futDates.has(d)) && etToMs(d, closeMin(cal, d)) <= now);
  if (!need.length) return refs;
  const bars = await five(futSymbol);
  for (const d of need) {
    const r = priceAt(bars, etToMs(d, closeMin(cal, d)));
    if (r) refs[d] = r;
  }
  return refs;
}

// The index level at 9:31 a.m.: the close of the 9:30 one-minute bar, the first full minute of trading.
// null before 9:30 or on a closed day. final = the minute is over (Yahoo has started the 9:31 bar, or
// it's past 9:35), so the number won't change.
async function at931(symbol: string, cal: Cal, now: number) {
  const n = et(now);
  if (!isTradingDay(cal, n.date) || n.mins < OPEN_MIN) return null;
  const p1 = Math.floor(etToMs(n.date, OPEN_MIN) / 1000);
  try {
    const c = await chart(symbol, `period1=${p1}&period2=${p1 + 300}&interval=1m`);
    const b = c.bars.find((x) => x.t === p1);
    if (!b) return null;
    return { close: b.close, time: p1 + 60, final: c.bars.some((x) => x.t >= p1 + 60) || now >= (p1 + 300) * 1000 };
  } catch {
    return null;
  }
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
    const now = Date.now();
    const cache = new Map<string, Promise<Awaited<ReturnType<typeof chart>>>>();
    const get = (s: string, q?: string) => { const k = `${s}|${q}`; if (!cache.has(k)) cache.set(k, chart(s, q)); return cache.get(k)!; };
    const five = (s: string) => get(s, "range=5d&interval=5m").then((c) => c.bars);
    // Specific contract first; if Yahoo ever stops serving it, fall back to the continuous series
    // (correct except in the days around an expiry).
    // Retried on every request, so it recovers by itself as soon as Yahoo serves the contract again.
    // `fallback: true` tells the page to show a warning.
    const future = (root: string, target: string) => {
      const contract = contractFor(root, target);
      return get(contract).then((f) => ({ ...f, contract, fallback: false }))
        .catch(() => get(`${root}=F`).then((f) => ({ ...f, contract, fallback: true })));
    };
    const [pairs, drivers, bond, ctx, wcsData] = await Promise.all([
      Promise.all(PAIRS.map(async (p) => {
        const target = targetDate(p.cal, now);
        const [idx, fut, open931] = await Promise.all([get(p.index), future(p.future, target), at931(p.index, p.cal, now)]);
        const refs = await futureRefs(p.cal, idx.bars, fut.symbol, fut.bars, now, five).catch(() => ({}));
        return { key: p.key, name: p.name, target, index: { ...idx, at931: open931 }, future: { ...fut, refs } };
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
      context(now).catch((e) => ({ error: String((e as Error).message ?? e) })),
      wcs(now),
    ]);
    return new Response(JSON.stringify({ fetchedAt: now, source: "Yahoo Finance; Bank of Canada; Government of Alberta", pairs, drivers, canada10y: bond, context: ctx, wcs: wcsData }), {
      headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=30", "X-Robots-Tag": "noindex, nofollow" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 502,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
