# Implied Open: explainer for traders

_Rewritten 2026-11-04 (shorter, for people who trade). Numbers from the accuracy tracker database on 2026-11-04; see "Sources" below._

**What it is.** A pre-market estimate of the 9:30 ET cash open for the S&P 500, Nasdaq-100, Dow, Russell 2000, Nasdaq Composite and S&P/TSX. Updates every minute. https://implied-open.soesraider.com

**Method.**
- Implied open = last cash close + point change in the index future since the 4:00 p.m. close (ES, NQ, YM, RTY; front quarterly contract, rolled on the Monday of expiry week).
- The prior close's futures-cash basis is carried forward; no fair-value model (carry is about 1 bp a day).
- Composite and TSX have no usable free futures: they take the NQ and ES percentage move, so treat them as rough.
- Holidays and 1 p.m. early closes handled.
- Data: Yahoo Finance; futures about 10 minutes delayed.

**After the bell** it shows the level at 9:31 (first full minute), not the first print. The first print is partly stale prices: on the Dow it typically captures only about half of the overnight gap.

**Context strip** (VIX, US 10-year, dollar index, Euro Stoxx 50, Brent, copper; change since the US close) is background only. None of it feeds the estimate.

**Accuracy.** Estimate taken with 9:20 a.m. futures, compared with the 9:31 level (9:35 before Oct 6, when no 1-minute data exists). 50 sessions, Aug 26 – Nov 4, 2026; Russell 38 sessions from Sep 14.

| Index | Avg miss | 9 days in 10 within | Direction right | "No change" avg miss |
|---|---|---|---|---|
| S&P 500 | 0.08% | 0.18% | 96% | 0.40% |
| Russell 2000 | 0.10% | 0.19% | 95% | 0.46% |
| Nasdaq-100 | 0.14% | 0.27% | 96% | 0.68% |
| Dow | 0.18% | 0.36% | 94% | 0.41% |
| Nasdaq Composite (proxy) | 0.20% | 0.46% | 92% | 0.62% |
| S&P/TSX (proxy) | 0.29% | 0.60% | 84% | 0.41% |

Earlier is rougher: S&P 500 average miss 0.19% at 5:30 a.m., 0.29% at 1:30 a.m. Live day-by-day record: https://implied-open.soesraider.com/accuracy

**Limits.** An estimate, not advice. Free, unofficial data feed. Days before Nov 4, 2026 were rebuilt from price history; live tracking started Nov 4.

## Sources for the numbers
- Accuracy table: `implied_open.snapshots` joined to `implied_open.actuals`, horizon 10 min (9:20 a.m. futures time), actual = `price_931`, else `price_935`; queried 2026-11-04 after the Russell 2000 backfill. Avg miss = mean |implied − actual| / actual; "9 days in 10" = 90th percentile of that; direction = sign(implied − prev close) = sign(actual − prev close); "no change" = mean |prev close − actual| / actual. All days counted, including contract-switch days. TSX is shown against 9:31 here for consistency; against 9:35 (the tracker's TSX default) its average miss is about the same (0.29% in the methodology review).
- 5:30 / 1:30 a.m. figures: same query at horizons 240 and 480 min (S&P 0.190% and 0.286%).
- Dow first print capturing about half the gap: HANDOFF.md, "Methodology review" (51% over 45 days).
- Carry about 1 bp a day: HANDOFF.md, "Methodology review".
