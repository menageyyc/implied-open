// /api/sxf: reads the Montreal Exchange SXF (S&P/TSX 60 futures) quote page and returns the
// front-month contract. PRIVATE: only reachable through _middleware.js (login required).
// Never move this into the public site or the public Supabase function.

const SOURCE = "https://www.m-x.ca/en/trading/data/quotes?symbol=SXF";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store, private" } });

const unescapeHtml = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

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
  if (!rows.length) return { error: "no SXF contracts found on the Montreal Exchange page (its layout may have changed)" };
  // Front month = the contract with the most open interest; ties go to the earliest expiry.
  rows.sort((a, b) => (b.open_interest || 0) - (a.open_interest || 0) || String(a.expiry_date).localeCompare(String(b.expiry_date)));
  const f = rows[0];
  const upd = html.match(/Last update:\s*<b>([^<]+)<\/b>/);
  return {
    pageTime: upd ? upd[1].replace(/&nbsp;/g, " ").trim() : null,
    front: {
      symbol: f.symbol, expiry: f.expiry_date,
      last: f.last_price, bid: f.bid_price, ask: f.ask_price, settlement: f.settlement_price,
      volume: f.volume, trades: f.nb_trades, openInterest: f.open_interest,
      open: f.open_price, high: f.high_price, low: f.low_price,
    },
  };
}

export async function onRequestGet() {
  let html;
  try {
    const r = await fetch(SOURCE, { headers: { "user-agent": "Mozilla/5.0 (compatible; implied-open personal page)", accept: "text/html" } });
    if (!r.ok) return json({ error: `the Montreal Exchange site answered with an error (${r.status})` }, 502);
    html = await r.text();
  } catch {
    return json({ error: "couldn't reach the Montreal Exchange site" }, 502);
  }
  const out = parse(html);
  if (out.error) return json(out, 502);
  return json(Object.assign({ fetchedAt: Date.now() }, out));
}
