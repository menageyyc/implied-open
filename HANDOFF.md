# Handoff

_Last updated: 2026-11-04 (whole-project review started: free-tier check done, cleanup job added; methodology review next)_

## Start here (fresh session)
- **Next session: Matt will ask two critical-analysis questions covering a review of the entire project.** Read this file, README.md and the code (`site/`, `private/`, `supabase/`) before answering. Matt flagged that one may need a higher Opus effort level: if a question needs deep judgment (e.g. method soundness, data reliability, security, legal exposure), say so and suggest raising the effort before answering rather than answering lightly.
- **Contract-switch fix: LIVE since 2026-11-04** (Matt approved). Relay `implied-open` v5 and logger `implied-open-accuracy` v3 deployed; history Sep 14 – Nov 4 rebuilt. Page changes (tile order, fallback warning, contract-switch days counted on /accuracy) approved by Matt and merged to main (PR #17), so both sites redeployed. **First real test: Mon Dec 14, 2026** (switch to the March contract): check that morning that the page shows sensible numbers and no yellow "Data problem" note. See "Contract-switch fix" below.
- **Public site:** https://implied-open.soesraider.com (friends, no login).
- **Private site:** https://implied-open-pvt.soesraider.com (Matt only, emailed-code login, 30-day sessions). Adds the Montreal Exchange SXF-based TSX estimate.
- **Accuracy tracker (2026-11-04):** live at https://implied-open.soesraider.com/accuracy, approved and merged by Matt. The logger collects every 5 minutes. Matt wants to look at it live and may ask for changes. At his request the default comparison is the official open (9:35 price is the alternative). See "Accuracy tracker" below.
- **Open items:**
  0. **Methodology review (Matt's question 2, scope agreed 2026-11-04):** formula vs professional fair value; futures reference timing (4:00 p.m. settlement vs later trading); what counts as "the actual open" (first print vs a later, fuller opening value — Matt wants this examined critically); Yahoo delay/staleness; Composite and TSX stand-ins; whether the tracker could flatter the page (45-day sample, rebuilt vs live, contract-switch days); holidays, half days, DST weeks. Answer in chat. Flag any part that should wait for more data. Run it at high/max effort.
  1. **Matt to send the permission email** to TMX Datalinx (marketdata@tmx.com), text in `notes/mx-permission-email.md` (already worded for a page that is live). Matt sends it himself; never send email on his behalf. If the Bourse says no, take the MX feed down (see "If the Bourse says no" below).
  2. **Evening check:** one weekday after 8 p.m. ET, confirm the private page's SXF number looks sensible (that m-x.ca's settlement has rolled to that day's). If it hasn't, widen the paused window in `private/sxf.js`.
  3. Optional, offered to Matt: "Sign in with Google" instead of the emailed code (needs a Google Cloud OAuth client, ~15 min with Matt). Optional: rename the Zero Trust team `small-credit-1e44`.
- **Hard rules:** MX data must never be reachable without logging in (page, `/api/sxf`, any preview or deployment link). Never put the MX fetch in the public Supabase function or in `site/`. Never create a top-level `functions/` folder (the public Pages project would serve it).

## Contract-switch fix (built 2026-11-04)
- **What changed:** the relay (`implied-open`) and the logger (`implied-open-accuracy`) no longer use Yahoo's continuous `ES=F`/`NQ=F`/`YM=F`. Each picks one quarterly contract by the date of the open being estimated (`contractFor()`, e.g. `ESZ26.CME`, `NQZ26.CME`, `YMZ26.CBT`) and uses it for both the live price and the reference close. Switch to the next contract from the Monday of expiry week (next: Mon Dec 14, 2026 → H27; Mon Mar 15, 2027 → M27). The relay falls back to `ES=F` etc. if Yahoo stops serving the specific contract. `site/index.html` is unchanged (the page formula didn't need to change), so the private build is unaffected (`node build.mjs` passes).
- **Verified:** Yahoo serves `.CME` (ES, NQ) and `.CBT` (YM) contracts with daily closes, 5-minute history and a live price; expired contracts (e.g. `ESU26.CME`) return Not Found. The daily close of the explicit contract matches its 4:00 p.m. 5-minute price within a few points. Contract dates checked for every quarter through Sep 2027.
- **Results, replaying Sep 2026 (estimate at 9:20 a.m. vs 9:35 price):** S&P 500 window days (Sep 14–21) +0.06, +0.20, +0.05, +0.25, −0.13, +0.08% (old: up to +1.13%). Nasdaq-100 −0.04 to +0.25% (old: up to +1.25%). Dow −0.10 to +0.57% (old: up to +1.36%); the Dow's remaining misses are market moves after 9:20: using the 9:35 futures price instead they're all within ±0.10%. Other days unchanged (S&P avg 0.087% both ways). The logger's new backfill code reproduced these numbers exactly (tested locally against live Yahoo with a stand-in database), and a simulated 8 a.m. tick saved all five indexes from the Dec contracts.
- **Backfill limit:** only dates whose contract Yahoo still serves can be rebuilt. From Sep 14 on (Dec contract) is fine; earlier dates are skipped and keep their existing rows (they were unaffected by the bug). The backfill result lists `unavailable` contracts.
- **Deployed 2026-11-04:** relay v5, logger v3 (both `verify_jwt: false`). Backfill re-run for all five indexes over Sep 14 – Nov 4 (every row rebuilt; checked against a saved copy of the old rows). Average miss at 9:20 a.m. vs 9:35 price on Sep 14–21, old → new: S&P 0.79 → 0.13%, NDX 0.86 → 0.09%, Composite 1.02 → 0.23%, Dow 1.01 → 0.29%, TSX 0.95 → 0.27%. Other days unchanged on average (largest single-row change 0.08%).
- **Logger timing fix (caught before deploying):** the logger picks the contract from the target open; Yahoo futures lag ~10 min, so between 9:30 and 9:40 it looks back 30 minutes to find the target, otherwise the last pre-open snapshots would be lost.
- **If Yahoo stops serving a contract:** the relay falls back to `ES=F` etc., marks it `fallback: true`, and the page shows a yellow "Data problem" note (stronger wording in expiry week). The relay retries the specific contract on every request (the page refreshes each minute), so it recovers by itself; the logger does the same and notes it in its tick result. Rule told to Matt: if the note is still there a day later, or appears at all in the week before an expiry week, ask for a fix.
- **Matt's decisions 2026-11-04:** contract-switch days now count in the accuracy averages by default (`site/accuracy.html` state.roll = true; checkbox still lets you leave them out). Main page tiles: wide screens S&P top-left, Nasdaq-100 top-right, Dow bottom-left, Composite bottom-right; phones S&P, Dow, Nasdaq-100, Composite (cards are in that order in the page and the grid fills column by column).

## Original brief: contract-switch fix
**Problem.** The page and the accuracy logger use Yahoo's continuous futures symbols (`ES=F`, `NQ=F`, `YM=F`). The formula is implied = last cash close + (futures now − futures "at that close"). "Futures now" is the live price (`meta.regularMarketPrice`); "futures at that close" is the **daily bar** close for the close date. Around each quarterly expiry, Yahoo's intraday/live series switches to the next contract days before its daily series does, so the page subtracts the old contract's close from the new contract's price. The new contract trades higher (about +65 S&P points in Sep 2026), so the estimate runs about 0.8–1.1% too high.

**Evidence (checked 2026-11-04, Yahoo 60-day data):** `ES=F` 5-minute bars at 4:00 p.m. sat about 7 points above the S&P 500 cash close through Fri Sep 11, then about 70 points above from Mon Sep 14. The daily bars stayed on the September contract (about +2 to +7) until Fri Sep 18 and switched on Mon Sep 21. Rebuilt S&P 500 estimates (futures price at 9:20 a.m., vs 9:35 price) missed by +1.09%, +0.93%, +1.13%, +0.75% and +0.80% on Sep 15, 16, 17, 18 and 21. Normal days miss by about 0.03–0.18%. NQ and YM show the same pattern.

**Next risk:** the December contract expires Fri Dec 18, 2026, so roughly Dec 14–21. March 2027 expires Fri Mar 19.

**Where the formula lives (change all of them in step):**
1. `site/index.html`, `render()`: `fRef = p.future.bars.find(... date === closeDate)` and `fNow = p.future.price`.
2. `supabase/functions/implied-open/index.ts` (the relay): fetches `ES=F`/`NQ=F`/`YM=F` with `range=5d&interval=1d`. Keep `verify_jwt: false` and a fixed symbol list.
3. `supabase/functions/implied-open-accuracy/index.ts` (the logger): `implied()` copies the page's formula, and `tick()` fetches the same symbols. If the page changes, the logger must change the same way, or the tracker stops measuring what the page shows.
4. The private site builds from `site/`, so it picks up page changes. `private/build.mjs` fails the build if its hook strings in `site/index.html` change, so run `cd private && node build.mjs` before merging.

**Fix options (verify before choosing):**
- **A (preferred): explicit contracts.** Request the specific quarterly contract, chosen by date, for both the live price and the reference close, e.g. `ESZ26.CME` (codes: H=Mar, M=Jun, U=Sep, Z=Dec). Roll to the next contract on a fixed rule, e.g. the Monday of expiry week, about when volume moves. **Not yet verified:** that Yahoo serves these symbols (try `.CME` for ES/NQ and `.CBT` for YM), with daily closes and a live price. If it works, the reference and the live price always come from the same contract.
- **B (fallback): same-series reference.** Take "futures at that close" from the intraday series at 4:00 p.m. ET on the close date (`interval=5m`), not the daily bar. This fixes most of the window. It still breaks for the one session in which the live series itself switches, unless Yahoo re-stitches history.
- Either way, the page could show a small "futures contract switch this week" note during the window.

**How to test:**
- Rebuild Sep 2026 with the new method and compare. The S&P misses on Sep 15–21 should fall to normal size (about 0.1–0.2%) without hurting other days. The logger's `backfill` action (POST with the Vault secret, e.g. `{"action":"backfill","key":"spx","from":"2026-09-01","to":"2026-09-30"}`, one index and about two weeks per call, triggered from SQL with `net.http_post` as in `supabase/accuracy.sql`) can rebuild history once it uses the new method. Futures 5-minute history only goes back 60 days (Sep 2026 drops out around Nov 25), so do this soon, or test against the next roll.
- After the fix, decide with Matt whether contract-switch days should still be left out of the accuracy averages (`implied_open.is_roll_day()` in the database, checkbox on the page). Rows rebuilt with the old method for Sep 15–21 are still in `implied_open.snapshots`; re-running backfill for those dates overwrites them, because backfill rows are replaced unless a live row exists.
- Show Matt screenshots and the Cloudflare preview (`https://<branch>.implied-open.pages.dev`) before merging. Merging to main redeploys both sites.

## Status
- The data relay is deployed and working: Supabase project "Menage", Edge Function `implied-open`, version 4 (adds the Canada data). It covers four US indexes plus the TSX, including the Nasdaq Composite (it uses NQ futures as a stand-in).
- The page (`site/`) is built and tested in a headless browser: desktop, tablet and phone widths, light and dark, live data, simulated market-open and weekend times.
- Site merged into main (PR #2), Canada section merged (PR #4).
- **Live at https://implied-open.soesraider.com** (hosted 2026-11-04). See "Hosting and deploys" below.
- The old private Claude artifact version was deleted at Matt's request.
- **Private SXF version (live 2026-11-04, approved by Matt):** https://implied-open-pvt.soesraider.com, login required. Matt logged in on his phone and confirmed live SXF numbers (so m-x.ca answers Cloudflare's servers). See "Private SXF site" below.

## Free tier (checked 2026-11-04)
- Supabase org "The House" is on the Free plan, which never charges; going over a limit means warnings/restrictions, not a bill. Cloudflare Pages/Access also free.
- Usage then: database 27 MB of 500 MB; logger ~8,600 of 500,000 function calls a month; the main page adds one call a minute per visible open tab. The 546 errors seen during backfill are the per-call compute limit, not a monthly quota.
- Growth: estimates ~54 MB/year. The cron run log was another ~75 MB/year, so a daily job `cron-run-log-cleanup` (08:17 UTC) now keeps only 7 days of it (in `supabase/accuracy.sql`). Optional later (Matt's call): thin snapshots older than a few months to every 30 minutes.
- The Menage project is shared with Matt's other apps, which draw on the same limits.

## Accuracy tracker
- **What:** a public page at `/accuracy` comparing saved estimates with the actual open, by index and by how early the estimate was taken. Charts: average miss by time before the open (vs the "no change" guess), signed miss per day, at-a-glance table, recent days.
- **Backend (live since 2026-11-04):** Edge Function `implied-open-accuracy` (verify_jwt false; GET = public summary, POST = needs Vault secret `implied_open_log_secret`). pg_cron job `implied-open-accuracy-tick` every 5 minutes. Schema `implied_open` (tables `snapshots`, `actuals`; functions `summary()`, `is_roll_day()`), not exposed through the API, RLS on, no grants. Setup SQL in `supabase/accuracy.sql`. Vault also holds `implied_open_log_url`.
- **Rebuilt history:** target dates 2026-08-26 to 2026-11-04, about 9,000 snapshots per index, from Yahoo 60-day 5-minute futures bars. Checked 2026-11-04: formula verified on every row, and the previous close, futures reference and actual opens matched an independent Python recomputation on all 249 index-days. Yahoo revises a few old 5-minute bars, so totals across all rows can't match exactly.
- **Results so far (45 clean days, vs 9:35 price; vs the official open the near-open S&P miss is also about 0.09%):** S&P 500 average miss 0.30% at 1:30 a.m., 0.20% at 5:30 a.m., 0.09% at 9:00–9:20 a.m. (direction right 96–98%; "no change" misses by 0.39%). Nasdaq-100 0.17–0.18% near the open, Dow 0.18%, Composite 0.21%, TSX stand-in 0.31% ("no change" 0.43%).
- **Limits:** holidays are skipped automatically (no open). The TSX uses the S&P 500 stand-in; SXF tracking was deferred by Matt (would need a logger on the private Cloudflare side, never Supabase).
- **To check it's running:** `select status, count(*), max(start_time) from cron.job_run_details where jobid = (select jobid from cron.job where jobname='implied-open-accuracy-tick') group by 1;` and the page's "Latest live snapshot" line.

## Private SXF site
- **What:** the public page plus a TSX estimate from Montreal Exchange SXF futures (main number) with the S&P 500 stand-in kept as a comparison. Only Matt can reach it.
- **Code:** `private/` in this repo. `private/build.mjs` copies `site/` and injects `private/sxf.js` (fails the build if the public page's hook points change). `private/functions/_middleware.js` checks the Access login token on every request and fails closed. `private/functions/api/sxf.js` fetches and parses the MX quote page (front month = most open interest; bid/ask midpoint when tight, else last trade).
- **Cloudflare:** Pages project `implied-open-pvt` (root dir `private`, build `node build.mjs`, output `dist`, previews OFF). Production branch `main` (was `claude/mx-private` during testing). Every merge to main redeploys both sites. Env vars: `ACCESS_TEAM_DOMAIN=small-credit-1e44.cloudflareaccess.com`, `ACCESS_AUD` (the Access app's AUD tag), `ALLOWED_EMAIL=menageyyc@gmail.com`.
- **DNS:** one new record in soesraider.com: `CNAME implied-open-pvt → implied-open-pvt.pages.dev`, proxied. Nothing else touched.
- **Access (Zero Trust, Free plan, team `small-credit-1e44`, set up by Matt 2026-11-04):** login method One-time PIN (email code). App "Implied Open (private)" covers `implied-open-pvt.soesraider.com`, `implied-open-pvt.pages.dev` and `*.implied-open-pvt.pages.dev`; policy "Matt only" allows menageyyc@gmail.com; session 720h (one month, the maximum).
- **Checks done:** 15 unit tests of the login gate (valid token for Matt passes; no settings, no token, forged, expired, wrong audience/issuer/email, tampered, alg none all get 403). Logged-out requests to the page, `/api/sxf` and `/sxf.js` on both main addresses redirect to the Cloudflare login. The public project's preview of this branch serves only the public page (no private code). Local run against live data: no page errors, no sideways scroll on phone. Live check by Matt after login, 2026-11-04 ~3:48 a.m. ET: SXF +0.43% vs S&P 500 stand-in −0.14% (gold +2.4%).
- **Open issue to watch:** the settlement shown on m-x.ca is assumed to be the previous session's from the start of the 8 p.m. ET session. The page hides the SXF estimate 4–8 p.m. ET weekdays to avoid mixing days. Check this assumption one evening.
- **If the Bourse says no:** delete the Pages project `implied-open-pvt`, the Access app, and the DNS record, and remove `private/`.

## Known limits
- Yahoo Finance's chart feed is unofficial. If it breaks, the function needs updating.
- Futures prices are about 10 minutes delayed.
- Market holidays aren't handled.
- The Composite estimate is a proxy.

## Hosting and deploys
- **Cloudflare Pages project `implied-open`** on Matt's Cloudflare account, connected to GitHub repo `menageyyc/implied-open`. Production branch `main`, no build command, output folder `site`.
- **Deploys are automatic.** Every merge to main republishes the site in about a minute. Nothing to run by hand. (On 2026-11-04 this needed Cloudflare's GitHub app to be given access to `implied-open`: GitHub → Settings → Applications → Cloudflare Workers and Pages → Configure → Repository access. If deploys ever stop, check that first. Direct link: https://github.com/settings/installations, which needs a web browser because the GitHub phone app doesn't have this setting.)
- **Previews:** every other branch (e.g. a `claude/*` branch with an open PR) gets its own preview link, `https://<branch>.implied-open.pages.dev`, and Cloudflare posts it on the PR. Use that link to show Matt website changes before merging.
- **Custom domain:** `implied-open.soesraider.com`, added to the Pages project, plus one DNS record in the soesraider.com zone: `CNAME implied-open → implied-open.pages.dev`, proxied. No other records in that zone were changed (the rest are Matt's existing GoDaddy/cPanel mail records).
- Also reachable at `https://implied-open.pages.dev` (same site).
- **Non-crawlable, checked live 2026-11-04:** the response carries `X-Robots-Tag: noindex, nofollow, noarchive` (from `site/_headers`), `/robots.txt` disallows everything, and the page has the noindex meta tag.
- **Checked live 2026-11-04:** loads over HTTPS, calls the Supabase function `implied-open` (HTTP 200), live prices and the Canada section render, no page errors.
- The hosting was set up through the Cloudflare API connector; Cloudflare's GitHub app was already installed on Matt's GitHub account (his other Pages projects use it), and only needed `implied-open` added to its repository access (see above).
- To manage it by hand: Cloudflare dashboard → Workers & Pages → `implied-open`.

## Montreal Exchange background (why it's private)
- The m-x.ca terms allow "access, view and download or print a copy" for strict personal, private, non-commercial use. "Retrieve", "reproduce" and "create works derived from the Content" need the Bourse's prior authorization, not limited to public use. An automated private page is still outside the terms as written. Matt was told this and on 2026-11-04 chose to build it anyway, privately, and to ask permission in parallel.
- MX data authorization goes through TMX Datalinx (per m-x.ca's Market Data Services page): marketdata@tmx.com, or the TMX Datalinx webstore Contact Us form.
- Data source: `https://www.m-x.ca/en/trading/data/quotes?symbol=SXF`, plain HTTP 200, no bot check, labelled "(Real-time)". Each contract row has a `data-row` attribute with HTML-escaped JSON (`symbol`, `expiry_date`, `last_price`, `bid_price`, `ask_price`, `settlement_price`, `open_interest`, `volume`, `nb_trades`, ...). Its "Last update" time is the page's generation time, not the quote time. On 2026-11-04 the front month was Dec 2026 (`SXFZ26`, expires 2026-12-18); the code picks the contract with the most open interest, which handles quarterly rolls.
- SXF hours: about 8 p.m. ET (previous evening) to 4:30 p.m. ET, per MX's 2021 extended-hours release; consistent with live data, not confirmed on a current MX page.
- Decisions with Matt, 2026-11-04: option A (public site unchanged + separate private copy) over making the whole site private; hostname `implied-open-pvt` (one level, because Cloudflare's free certificate doesn't cover `x.implied-open.soesraider.com`); SXF as the main TSX number with the S&P 500 stand-in as comparison; emailed-code login.
- Login reality told to Matt: at most one login per browser/device per month; clearing cookies or private windows mean logging in again.
