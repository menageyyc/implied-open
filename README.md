# Implied Open

A single web page that estimates where the S&P 500, Nasdaq-100, Nasdaq Composite, Dow and S&P/TSX Composite will open at 9:30 a.m. Eastern, from overnight futures. It has no inputs, fetches prices when opened and refreshes every minute. Each result comes with a plain-language explanation.

## Layout
- `site/index.html`: the page.
- `site/robots.txt`, `site/_headers`: keep search engines out. The page also carries a `noindex` meta tag.
- `supabase/functions/implied-open/index.ts`: the data relay.
- `private/`: Matt's login-protected version (https://implied-open-pvt.soesraider.com), a separate Cloudflare Pages project. It builds from `site/` and adds a TSX estimate from Montreal Exchange SXF futures. See HANDOFF.md, "Private SXF site".

## Where the data comes from
Browsers can't read Yahoo Finance directly, so the page calls a small Supabase Edge Function:
`https://awagbieeouxxhytdhloi.supabase.co/functions/v1/implied-open`
The function fetches fixed symbols from Yahoo's free, unofficial chart feed. Index closes: ^GSPC, ^NDX, ^IXIC, ^DJI, ^GSPTSE. Futures: ES=F, NQ=F, YM=F. Canada drivers: CL=F (oil), NG=F (natural gas), GC=F (gold), CADUSD=X. It also pulls the Government of Canada 10-year benchmark yield (series BD.CDN.10YR.DQ.YLD, daily) from the Bank of Canada Valet API. It's read-only, needs no key, can't fetch anything else and doesn't touch the database.

## The calculation
- Implied open = last cash close + (futures now − futures settlement on that close date). Using the futures' point move builds in the normal gap between futures and cash prices.
- Nasdaq Composite: there are no futures, so it applies the NQ percentage move to the Composite close.
- S&P/TSX Composite: it applies the ES (S&P 500) percentage move, because Canadian index futures (SXF on the Montreal Exchange) have no free feed. The exchange's terms forbid retrieving and republishing its data without permission. A "Canada drivers" panel adds oil, natural gas, gold, the Canadian dollar and the 10-year yield, with plain-language notes. A move counts as meaningful only above oil 0.5%, gas 0.75%, gold 0.3% or CAD 0.1%.
- During market hours, the page shows each index's actual open instead.
- Estimates get more reliable closer to 9:30 a.m. ET: overnight trading is light, more traders join after about 8 a.m. and economic data often comes out at 8:30 a.m.

## Caveats
Yahoo futures prices are about 10 minutes delayed. The feed is unofficial and may change. Market holidays aren't handled.
