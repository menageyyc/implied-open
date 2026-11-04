# Handoff

_Last updated: 2026-11-04 (end of MX session: private SXF site live and merged)_

## Start here (fresh session)
- **Public site:** https://implied-open.soesraider.com (friends, no login).
- **Private site:** https://implied-open-pvt.soesraider.com (Matt only, emailed-code login, 30-day sessions). Adds the Montreal Exchange SXF-based TSX estimate.
- Nothing is mid-flight. All work is merged to main; no `claude/*` branch holds unmerged work.
- **Open items:**
  1. **Matt to send the permission email** to TMX Datalinx (marketdata@tmx.com), text in `notes/mx-permission-email.md` (already worded for a page that is live). Matt sends it himself; never send email on his behalf. If the Bourse says no, take the MX feed down (see "If the Bourse says no" below).
  2. **Evening check:** one weekday after 8 p.m. ET, confirm the private page's SXF number looks sensible (that m-x.ca's settlement has rolled to that day's). If it hasn't, widen the paused window in `private/sxf.js`.
  3. Optional, offered to Matt: "Sign in with Google" instead of the emailed code (needs a Google Cloud OAuth client, ~15 min with Matt). Optional: rename the Zero Trust team `small-credit-1e44`.
- **Hard rules:** MX data must never be reachable without logging in (page, `/api/sxf`, any preview or deployment link). Never put the MX fetch in the public Supabase function or in `site/`. Never create a top-level `functions/` folder (the public Pages project would serve it).

## Status
- The data relay is deployed and working: Supabase project "Menage", Edge Function `implied-open`, version 4 (adds the Canada data). It covers four US indexes plus the TSX, including the Nasdaq Composite (it uses NQ futures as a stand-in).
- The page (`site/`) is built and tested in a headless browser: desktop, tablet and phone widths, light and dark, live data, simulated market-open and weekend times.
- Site merged into main (PR #2), Canada section merged (PR #4).
- **Live at https://implied-open.soesraider.com** (hosted 2026-11-04). See "Hosting and deploys" below.
- The old private Claude artifact version was deleted at Matt's request.
- **Private SXF version (live 2026-11-04, approved by Matt):** https://implied-open-pvt.soesraider.com, login required. Matt logged in on his phone and confirmed live SXF numbers (so m-x.ca answers Cloudflare's servers). See "Private SXF site" below.

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
