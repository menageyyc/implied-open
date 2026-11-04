// Accuracy tracker for the Implied Open page.
//
// GET  (public, no key)  -> JSON summary the accuracy page draws (read-only).
// POST (needs header x-log-secret = the Vault secret implied_open_log_secret):
//   {"action":"tick"}               every 5 minutes from pg_cron: saves a snapshot of the
//                                   implied open (same formula as the page) and, after the
//                                   open, the actual opening numbers.
//   {"action":"backfill","key":"..","from":"YYYY-MM-DD","to":"YYYY-MM-DD"}
//                                   one-off: rebuilds past estimates from Yahoo's 5-minute futures
//                                   history (about 60 days) and the actual opens, for target dates
//                                   in [from, to] (run in small ranges to stay within limits).
//
// Data lives in the database schema implied_open (not exposed through the API). Symbols are
// fixed, there is no user input to fetch, so this can't be used as a proxy.
// Deployed to Supabase project "Menage" with verify_jwt = false (the page calls GET without a key).
import postgres from "npm:postgres@3.4.5";

const PAIRS = [
  { key: "spx", index: "^GSPC", future: "ES", proxy: false },
  { key: "ndx", index: "^NDX", future: "NQ", proxy: false },
  { key: "ixic", index: "^IXIC", future: "NQ", proxy: true },
  { key: "dji", index: "^DJI", future: "YM", proxy: false },
  { key: "tsx", index: "^GSPTSE", future: "ES", proxy: true },
];
const EXCHANGE: Record<string, string> = { ES: "CME", NQ: "CME", YM: "CBT" };
type Pair = typeof PAIRS[number];

const OPEN_MIN = 570; // 9:30 a.m.
const MAX_HORIZON = 930; // from 6 p.m. ET the evening before (when futures reopen)
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "*" };

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });

// ---------- Eastern-time helpers ----------
// Fast Eastern time from US daylight-saving rules (2nd Sunday of March 2 a.m. to 1st Sunday of November 2 a.m.).
const dstCache = new Map<number, [number, number]>();
function dst(y: number) {
  let b = dstCache.get(y);
  if (!b) {
    const mar1 = new Date(Date.UTC(y, 2, 1)).getUTCDay(), nov1 = new Date(Date.UTC(y, 10, 1)).getUTCDay();
    const start = Date.UTC(y, 2, 1 + ((7 - mar1) % 7) + 7, 7); // 2 a.m. EST = 07:00 UTC
    const end = Date.UTC(y, 10, 1 + ((7 - nov1) % 7), 6); // 2 a.m. EDT = 06:00 UTC
    b = [start, end]; dstCache.set(y, b);
  }
  return b;
}
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function et(ms: number) {
  const [a, b] = dst(new Date(ms).getUTCFullYear());
  const d = new Date(ms - (ms >= a && ms < b ? 4 : 5) * 3600000);
  return { date: d.toISOString().slice(0, 10), mins: d.getUTCHours() * 60 + d.getUTCMinutes(), wd: WD[d.getUTCDay()] };
}
const isWeekend = (wd: string) => wd === "Sat" || wd === "Sun";
function addDays(date: string, n: number) {
  const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
const weekdayOf = (date: string) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(date + "T12:00:00Z").getUTCDay()];
function nextWeekday(date: string) { let d = addDays(date, 1); while (isWeekend(weekdayOf(d))) d = addDays(d, 1); return d; }
// UTC milliseconds of a given Eastern date + minutes after midnight (handles daylight saving).
function etToMs(date: string, mins: number) {
  let guess = Date.parse(date + "T00:00:00Z") + (mins + 300) * 60000;
  for (let i = 0; i < 2; i++) {
    const e = et(guess);
    const diff = (Date.parse(e.date + "T00:00:00Z") - Date.parse(date + "T00:00:00Z")) / 60000 + e.mins - mins;
    guess -= diff * 60000;
  }
  return guess;
}
// Which open a futures price at time ms counts toward, and how many minutes before it.
function targetFor(ms: number) {
  const e = et(ms);
  let target: string | null = null;
  if (e.mins >= 18 * 60) target = nextWeekday(e.date);
  else if (e.mins <= OPEN_MIN && !isWeekend(e.wd)) target = e.date;
  if (!target) return null;
  const horizon = Math.round((etToMs(target, OPEN_MIN) - ms) / 60000);
  if (horizon < 0 || horizon > MAX_HORIZON) return null;
  return { target, horizon };
}

// ---------- Futures contract (same rule as the relay) ----------
// One specific quarterly contract per open being estimated (e.g. ESZ26.CME), not Yahoo's continuous
// ES=F series, whose live price and daily closes switch contracts on different days around expiry.
// Contracts expire on the 3rd Friday of Mar/Jun/Sep/Dec; switch from the Monday of expiry week.
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

// ---------- Yahoo ----------
type Bar = { t: number; open: number | null; close: number; d: string; m: number }; // d, m = Eastern date and minutes
async function chart(symbol: string, range: string, interval: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${symbol} ${range}/${interval}: HTTP ${res.status}`);
  const r = (await res.json())?.chart?.result?.[0];
  if (!r) throw new Error(`${symbol}: no data`);
  const q = r.indicators?.quote?.[0] ?? {};
  const bars: Bar[] = (r.timestamp ?? []).map((t: number, i: number) => ({ t, open: q.open?.[i] ?? null, close: q.close?.[i] ?? null }))
    .filter((b: Bar) => b.close != null)
    .map((b: Bar) => { const e = et(b.t * 1000); return { ...b, d: e.date, m: e.mins }; });
  return { price: r.meta.regularMarketPrice as number, time: r.meta.regularMarketTime as number, bars };
}
function makeGetter() {
  const cache = new Map<string, ReturnType<typeof chart>>();
  return (s: string, range: string, interval: string) => {
    const k = `${s}|${range}|${interval}`;
    if (!cache.has(k)) cache.set(k, chart(s, range, interval));
    return cache.get(k)!;
  };
}

// The page's formula. closeBars = index daily bars, futBars = futures daily bars.
function implied(p: Pair, closeBars: Bar[], futBars: Bar[], target: string, fNow: number) {
  const prior = closeBars.filter((b) => b.d < target);
  const closeBar = prior[prior.length - 1];
  if (!closeBar) return null;
  const closeDate = closeBar.d;
  const fRef = futBars.find((b) => b.d === closeDate);
  if (!fRef) return null;
  const fPts = fNow - fRef.close;
  const pct = p.proxy ? (fPts / fRef.close) * 100 : (fPts / closeBar.close) * 100;
  const value = p.proxy ? closeBar.close * (1 + pct / 100) : closeBar.close + fPts;
  return { implied: value, pct, prev_close: closeBar.close, close_date: closeDate, fut_ref: fRef.close, fut_now: fNow };
}

// Actual opens from index bars: official open = first printed value; 9:35 = close of the 9:30 five-minute bar.
function actualsFrom(key: string, daily: Bar[], five: Bar[]) {
  const at930 = new Map<string, Bar>();
  for (const b of five) if (b.m === OPEN_MIN) at930.set(b.d, b);
  const rows = [];
  for (let i = 1; i < daily.length; i++) {
    const d = daily[i].d;
    const b = at930.get(d);
    rows.push({ trade_date: d, key, prev_close: daily[i - 1].close, open_official: daily[i].open ?? b?.open ?? null, price_935: b ? b.close : null });
  }
  return rows;
}

const SNAP_COLS = ["target_date", "key", "horizon_min", "data_time", "implied", "pct", "prev_close", "close_date", "fut_ref", "fut_now", "source"];
async function saveSnapshots(rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    await sql`insert into implied_open.snapshots ${sql(chunk, SNAP_COLS)}
      on conflict (target_date, key, horizon_min) do update set
        data_time = excluded.data_time, implied = excluded.implied, pct = excluded.pct, prev_close = excluded.prev_close,
        close_date = excluded.close_date, fut_ref = excluded.fut_ref, fut_now = excluded.fut_now,
        source = excluded.source, logged_at = now()
      where implied_open.snapshots.source = 'backfill' or excluded.source = 'live'`;
  }
}
async function saveActuals(rows: Record<string, unknown>[]) {
  const ok = rows.filter((r) => r.open_official != null);
  if (!ok.length) return 0;
  await sql`insert into implied_open.actuals ${sql(ok, ["trade_date", "key", "prev_close", "open_official", "price_935"])}
    on conflict (trade_date, key) do update set prev_close = excluded.prev_close, open_official = excluded.open_official,
      price_935 = coalesce(excluded.price_935, implied_open.actuals.price_935), updated_at = now()`;
  return ok.length;
}

async function tick() {
  const now = Date.now(), n = et(now), get = makeGetter();
  const out: Record<string, unknown> = { at: new Date(now).toISOString() };
  // Snapshot: only while a futures price can count toward an upcoming open.
  const snaps: Record<string, unknown>[] = [];
  const notes: string[] = [];
  const tNow = targetFor(Math.floor(now / 300000) * 300000);
  for (const p of PAIRS) {
    try {
      if (!tNow) { notes.push(`${p.key}: outside the snapshot window`); continue; }
      const fut = await get(contractFor(p.future, tNow.target), "5d", "1d");
      const ms = fut.time * 1000;
      if (now - ms > 30 * 60000) { notes.push(`${p.key}: futures price is stale`); continue; }
      const slot = Math.floor(ms / 300000) * 300000;
      const t = targetFor(slot);
      if (!t) { notes.push(`${p.key}: outside the snapshot window`); continue; }
      if (t.target !== tNow.target) { notes.push(`${p.key}: futures price is from the previous window`); continue; }
      const idx = await get(p.index, "5d", "1d");
      const r = implied(p, idx.bars, fut.bars, t.target, fut.price);
      if (!r) { notes.push(`${p.key}: missing close or futures reference`); continue; }
      snaps.push({ target_date: t.target, key: p.key, horizon_min: t.horizon, data_time: new Date(ms), ...r, source: "live" });
    } catch (e) { notes.push(`${p.key}: ${(e as Error).message}`); }
  }
  if (snaps.length) await saveSnapshots(snaps);
  out.snapshots = snaps.length; out.notes = notes;
  // Actual opens: weekdays 9:40-10:30 a.m. and once after the close (as a backup).
  if (!isWeekend(n.wd) && ((n.mins >= 580 && n.mins <= 630) || (n.mins >= 990 && n.mins < 1000))) {
    let saved = 0;
    for (const p of PAIRS) {
      try {
        const [d, f] = await Promise.all([get(p.index, "5d", "1d"), get(p.index, "5d", "5m")]);
        saved += await saveActuals(actualsFrom(p.key, d.bars, f.bars));
      } catch (e) { notes.push(`${p.key} actuals: ${(e as Error).message}`); }
    }
    out.actuals = saved;
  }
  return out;
}

async function backfill(key: string, from = "0000-00-00", to = "9999-99-99") {
  const p = PAIRS.find((x) => x.key === key);
  if (!p) throw new Error("unknown key");
  const get = makeGetter();
  const [idxD, idx5] = await Promise.all([get(p.index, "3mo", "1d"), get(p.index, "60d", "5m")]);
  // Each target date uses its own contract (both the 5-minute prices and the reference close).
  // Yahoo drops expired contracts, so targets whose contract is gone are skipped (existing rows are kept).
  const futs = new Map<string, Promise<{ d: Awaited<ReturnType<typeof chart>>; f: Awaited<ReturnType<typeof chart>> } | null>>();
  const futFor = (c: string) => {
    if (!futs.has(c)) futs.set(c, Promise.all([get(c, "3mo", "1d"), get(c, "60d", "5m")]).then(([d, f]) => ({ d, f })).catch(() => null));
    return futs.get(c)!;
  };
  // Contracts covering the requested targets, within the ~60 days of 5-minute history Yahoo keeps.
  const today = et(Date.now()).date, first = from > addDays(today, -100) ? from : addDays(today, -100);
  const last = to < addDays(today, 7) ? to : addDays(today, 7);
  const contracts: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const c = contractFor(p.future, d);
    if (!contracts.includes(c)) contracts.push(c);
  }
  const loaded = new Map(await Promise.all(contracts.map(async (c) => [c, await futFor(c)] as const)));
  const rows: Record<string, unknown>[] = [];
  for (const [c, fut] of loaded) {
    if (!fut) continue;
    for (const b of fut.f.bars) {
      const ms = (b.t + 300) * 1000; // a five-minute bar's close is the price at the end of the bar
      if (ms > Date.now() - 15 * 60000) continue; // leave recent times to the live logger
      const t = targetFor(ms);
      if (!t || t.target < from || t.target > to || contractFor(p.future, t.target) !== c) continue;
      const r = implied(p, idxD.bars, fut.d.bars, t.target, b.close);
      if (!r) continue;
      rows.push({ target_date: t.target, key, horizon_min: t.horizon, data_time: new Date(ms), ...r, source: "backfill" });
    }
  }
  await saveSnapshots(rows);
  const actuals = await saveActuals(actualsFrom(key, idxD.bars, idx5.bars).filter((r) => r.trade_date >= from && r.trade_date <= to));
  const unavailable = [...loaded].filter(([, f]) => !f).map(([c]) => c);
  return { key, from, to, contracts, unavailable, snapshots: rows.length, actuals };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    if (req.method === "GET") {
      const [{ summary }] = await sql`select implied_open.summary() as summary`;
      return new Response(JSON.stringify(summary), {
        headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=120", "X-Robots-Tag": "noindex, nofollow" },
      });
    }
    if (req.method === "POST") {
      const [row] = await sql`select decrypted_secret as s from vault.decrypted_secrets where name = 'implied_open_log_secret'`;
      const secret = row?.s as string | undefined;
      if (!secret || req.headers.get("x-log-secret") !== secret) return new Response("forbidden", { status: 403 });
      const body = await req.json().catch(() => ({}));
      const result = body.action === "backfill" ? await backfill(String(body.key), body.from, body.to) : await tick();
      return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
    }
    return new Response("method not allowed", { status: 405, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
