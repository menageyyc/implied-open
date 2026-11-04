# Implied Open

A single web page that estimates where the S&P 500, Nasdaq-100, Nasdaq Composite, Dow and S&P/TSX Composite will open at 9:30 a.m. Eastern, from overnight futures. It has no inputs, fetches prices when opened and refreshes every minute. Each result comes with a plain-language explanation.

## Layout
- `site/index.html`: the page.
- `site/robots.txt`, `site/_headers`: keep search engines out. The page also carries a `noindex` meta tag.
- `supabase/functions/implied-open/index.ts`: the data relay.
- `site/accuracy.html`: the track-record page (https://implied-open.soesraider.com/accuracy).
- `supabase/functions/implied-open-accuracy/index.ts` + `supabase/accuracy.sql`: the accuracy logger and its database setup.
- `private/`: Matt's login-protected version (https://implied-open-pvt.soesraider.com), a separate Cloudflare Pages project. It builds from `site/` and adds a TSX estimate from Montreal Exchange SXF futures. See HANDOFF.md, "Private SXF site".

## Where the data comes from
Browsers can't read Yahoo Finance directly, so the page calls a small Supabase Edge Function:
`https://awagbieeouxxhytdhloi.supabase.co/functions/v1/implied-open`
The function fetches fixed symbols from Yahoo's free, unofficial chart feed. Index closes: ^GSPC, ^NDX, ^IXIC, ^DJI, ^GSPTSE. Futures: one specific quarterly contract each of E-mini S&P 500, E-mini Nasdaq-100 and Mini Dow, chosen by date (e.g. ESZ26.CME, NQZ26.CME, YMZ26.CBT; month codes H=Mar, M=Jun, U=Sep, Z=Dec). It switches to the next contract from the Monday of expiry week (contracts expire on the third Friday of March, June, September and December). If Yahoo ever stops serving the specific contract, it falls back to the continuous series (ES=F, NQ=F, YM=F). Canada drivers: CL=F (oil), NG=F (natural gas), GC=F (gold), CADUSD=X. It also pulls the Government of Canada 10-year benchmark yield (series BD.CDN.10YR.DQ.YLD, daily) from the Bank of Canada Valet API. It's read-only, needs no key, can't fetch anything else and doesn't touch the database.

## The calculation
- Implied open = last cash close + (futures now − futures settlement on that close date). Using the futures' point move builds in the normal gap between futures and cash prices.
- Nasdaq Composite: there are no futures, so it applies the NQ percentage move to the Composite close.
- S&P/TSX Composite: it applies the ES (S&P 500) percentage move, because Canadian index futures (SXF on the Montreal Exchange) have no free feed. The exchange's terms forbid retrieving and republishing its data without permission. A "Canada drivers" panel adds oil, natural gas, gold, the Canadian dollar and the 10-year yield, with plain-language notes. A move counts as meaningful only above oil 0.5%, gas 0.75%, gold 0.3% or CAD 0.1%.
- During market hours, the page shows each index's actual open instead.
- If Yahoo stops serving the specific futures contract, the page shows a yellow "Data problem" note while it uses the continuous series. It retries every minute and the note clears by itself; if it's still there a day later, the code needs fixing.
- Estimates get more reliable closer to 9:30 a.m. ET: overnight trading is light, more traders join after about 8 a.m. and economic data often comes out at 8:30 a.m.

## Caveats
Yahoo futures prices are about 10 minutes delayed. The feed is unofficial and may change. Market holidays aren't handled.

## Accuracy tracking
- Every 5 minutes, a scheduled job in the Supabase database (pg_cron job `implied-open-accuracy-tick`) calls the Edge Function `implied-open-accuracy`. From 6 p.m. to 9:30 a.m. Eastern it saves the implied open for each index, using the page's formula, filed under the futures price's time (Yahoo's futures run about 10 minutes behind). On weekdays from 9:40 to 10:30 a.m. and at 4:30 p.m. it saves the actual official open and the index level at 9:35 a.m.
- Data lives in the database schema `implied_open` (tables `snapshots` and `actuals`), which isn't exposed through Supabase's API. The function reads it over a direct database connection. Its GET returns a JSON summary for the page with no key needed. Its POST needs a shared secret stored in Supabase Vault (`implied_open_log_secret`).
- History from Aug 26 to Nov 4, 2026 was rebuilt from Yahoo's 5-minute futures history (marked "rebuilt" on the page). Live snapshots start Nov 4, 2026.
- Futures contract-switch days (Tuesday of a quarterly expiry week through the following Monday) are flagged (grey on the day-by-day chart) and, since the fix below, counted in the averages by default (a checkbox leaves them out). Yahoo's intraday and daily futures series switch to the next contract on different days, which made September 2026's estimates about 1% too high on those days. Fix (2026-11-04): the page and the logger now use one specific contract for both the live price and the reference close, so the two can't come from different contracts. Replaying Sep 14–21, 2026 with the fix, the S&P 500 miss near the open fell from about 0.8–1.1% to about 0.05–0.25%, with other days unchanged. The logger's backfill can only rebuild dates whose contract Yahoo still serves (expired contracts disappear), so it skips older dates and keeps their existing rows.
