# Extra market data for the page: what's available (researched 2026-11-04)

Nothing here is built. These are options for Matt to choose from. Every symbol and endpoint below was tested live on 2026-11-04 unless marked otherwise.

## The honest framing
None of this makes the implied-open estimate itself more accurate: the open is driven by the index futures, which the page already uses. The extra data explains *why* futures moved overnight (rates, volatility, Europe, oil) and gives Alberta context. It's a "context strip", not a better forecast.

## 1. Live overnight context from the same Yahoo feed (easy, free; fits the existing relay)
All return a live price and 5-minute bars overnight unless noted. Adding them means adding fixed symbols to the relay (keep the list fixed so it can't be used as an open proxy).

| What | Symbol | Notes |
|---|---|---|
| Russell 2000 implied open | ^RUT + RTYZ26.CME | Same method as the S&P (index close + futures move), so it could be a 5th US estimate. Small caps react most to domestic policy and rates, so it's relevant on election mornings. |
| Volatility (VIX) | ^VIX | Computed from ~3:15 a.m. ET (Yahoo bars start 08:15 UTC). VIX futures (VX=F) are not on Yahoo. |
| US 10-year | ZN=F (10-yr T-note futures) overnight; ^TNX (yield) from ~8:20 a.m. ET | ^TNX doesn't update overnight. ZN=F is a price (up = yields down). 2-year: ZT=F. |
| US dollar index | DX-Y.NYB | Live overnight. |
| Europe | ^STOXX50E, ^GDAXI, ^FTSE | Trade 3 a.m.–11:30 a.m. ET, so live during the US pre-market. |
| Asia (closed by the US morning) | ^N225, ^HSI | Useful as "how Asia closed". |
| Brent (Brent–WTI spread) | BZ=F | WTI (CL=F) is already on the page. |
| Copper (TSX miners) | HG=F | Live overnight. |
| Bitcoin (24/7 risk mood) | BTC-USD | Live 24/7. |
| S&P/TSX 60 (the index behind SXF) | TX60.TS | Daytime only. |

## 2. Alberta-specific: WCS and Alberta gas
**What WCS is, and why there's no free live price.** Western Canadian Select is priced as a discount (differential) to WTI. It isn't an exchange-traded outright like WTI. The differential is mostly set during the monthly trading window and assessed by paid price-reporting agencies (Net Energy, Argus and others). Exchanges list WCS differential futures (e.g. ICE's Argus WCS Houston contract, code ASX), but Yahoo doesn't carry them: `WCC=F` exists on Yahoo but returns no prices, and `WCS=F` is not found.

**Free official source (recommended): Government of Alberta Economic Dashboard API.** No key, JSON, monthly averages back to 1986:
- Oil: `https://api.economicdata.alberta.ca/data?table=OilPrices&Type=WCS;WTI` (US$/bbl). Latest on 2026-11-04: **Sep 2026: WCS $80.37, WTI $97.31, so WCS was $16.94 below WTI.** Published about a month behind (the dashboard page said "Updated Oct 28, 2026"). Linked from https://economicdashboard.alberta.ca/OilPrice ("API Keys" section).
- Gas: `https://api.economicdata.alberta.ca/data?table=NaturalGasPrices` (C$/GJ, series "NatGas"). Latest: Aug 2026 $1.23/GJ. I found this table name by trying it; confirm which Alberta gas price it is (likely the AECO/Alberta reference price) before labelling it.
- Terms not yet checked (likely Alberta's Open Government Licence). Check before building.

**Possible display:** "WCS (Sep avg): $80.37, $16.94 under WTI" plus, optionally, a clearly labelled rough live figure = live WTI minus last month's discount. The discount can move several dollars a month, so that live figure is a ballpark, not a quote.

**Commercial option (not recommended yet):** OilPriceAPI shows a WCS price and has a free tier (50 requests/day), but it doesn't say where its WCS number comes from or how often it updates. On 2026-11-04 it showed WCS $83.74 (6:10 p.m. GMT) while WTI was about $88.80, a ~$5 discount that doesn't fit the ~$17 September average. Can't vouch for it.

**Relevance to the open:** low day to day. WTI's overnight move drives Canadian energy stocks at the open. The WCS discount changes slowly and matters more for producers' earnings and Alberta's budget. Worth showing as context for Alberta readers, not as a forecasting input.

## 3. Event calendar (moderate effort, once a year)
A line such as "Today 8:30 a.m.: US CPI" or "10:00 a.m.: Bank of Canada decision", from fixed yearly lists copied from official schedules (BLS, BEA, Fed, Bank of Canada, Statistics Canada), maintained like the holiday lists. No free live API was found that's reliable enough to rely on.

## Sources
- Government of Alberta, Economic Dashboard, Oil prices: https://economicdashboard.alberta.ca/OilPrice
- Alberta open data, Energy prices dataset: https://open.alberta.ca/opendata/energy-prices (lists EIA as the source of its oil series; the page returned an error when fetched on 2026-11-04)
- ICE, Argus WCS (Houston) Crude Oil Trade Month Future: https://www.ice.com/products/83048633/Crude-Oil-Diff---Argus-WCS-(Houston)-Crude-Oil-Trade-Month-Balmo-Future
- Argus WCS methodology: https://www.argusmedia.com/en/methodology/key-commodity-prices/argus-western-canadian-select
- OilPriceAPI WCS page and Canada page: https://www.oilpriceapi.com/live/wcs-crude-oil-price, https://www.oilpriceapi.com/canada
- Background: https://en.wikipedia.org/wiki/Western_Canadian_Select
