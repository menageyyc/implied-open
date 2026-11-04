# Handoff

_Last updated: 2026-11-04 (MX session: decisions made, waiting on Matt's Zero Trust setup)_

## Status
- The data relay is deployed and working: Supabase project "Menage", Edge Function `implied-open`, version 4 (adds the Canada data). It covers four US indexes plus the TSX, including the Nasdaq Composite (it uses NQ futures as a stand-in).
- The page (`site/`) is built and tested in a headless browser: desktop, tablet and phone widths, light and dark, live data, simulated market-open and weekend times.
- Site merged into main (PR #2), Canada section merged (PR #4).
- **Live at https://implied-open.soesraider.com** (hosted 2026-11-04). See "Hosting and deploys" below.
- The old private Claude artifact version was deleted at Matt's request.

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

## Pending: next job is the Montreal Exchange (SXF) feed
**Matt's decision, 2026-11-04:** build the Montreal Exchange TSX 60 futures (SXF) data into the page, **even if that means the MX version is only reachable by Matt** (a non-public page). This replaces the earlier "(a) link / (b) link + email / (c) leave it" question.

What Matt was told, and accepted: the MX terms need the Bourse's prior authorization to "retrieve" or "reproduce" content, and that isn't limited to public use (see the section below). A private, personal, non-commercial page lowers the stakes a lot, but it is still outside the terms as written. Matt chose to go ahead. Still offer to draft the permission email to the Bourse in parallel; if they say no, take the MX feed down.

**Hard rule, unchanged:** MX data must never be reachable without logging in. That covers the page, the data fetch behind it, and any preview link.

**Do this before building (big picture first, number the questions):**
1. Put the structure to Matt and get his choice:
   - (A, recommended) The public site stays exactly as it is for friends. Add a **separate private copy** (e.g. a second Cloudflare Pages project or a hostname such as `me.implied-open.soesraider.com`) that adds the SXF-based TSX estimate, locked behind **Cloudflare Access** (one-time code emailed to Matt's Gmail).
   - (B) Make the whole site private. Friends lose access.
2. The MX fetch can't go in the existing Supabase function. That function is public (`verify_jwt: false`), so anyone could pull MX data through it. Put the fetch somewhere covered by the same Access lock, e.g. a **Cloudflare Pages Function on the private project** (`/api/...` on the same protected hostname), or a Worker on a route Access protects. Check that a logged-out request to the data URL gets blocked, not just the page.
3. Preview links: Pages previews (`*.pages.dev`) are public by default. For the private project, either turn off previews or put Access on them too (Pages has a setting that protects preview deployments with Access).
4. Check the data before designing around it: fetch the m-x.ca SXF quote page server-side and see whether it works without a browser (bot protection, cookies), how delayed the quotes are (MX public quotes are usually delayed), and which contract month is the front month (SXF is quarterly: Mar/Jun/Sep/Dec, so rolls need handling). Read the page's HTML in full; don't assume its structure.
5. Method to propose: SXF vs. its value at the last S&P/TSX 60 close gives an implied % move for the TSX 60, applied to the S&P/TSX Composite as a proxy (say so on the page, like the Nasdaq Composite note). Compare it with the current S&P 500-futures-based TSX estimate and decide with Matt whether to show both.
6. Cloudflare Zero Trust (needed for Access) may need a one-time setup in Matt's browser (team name, Free plan, possibly a payment method even on Free). Verify the current requirements in the Cloudflare docs before telling Matt what to click.

### Data check done 2026-11-04 (MX session, ~2:20 a.m. ET)
- **Fetchable server-side:** `https://www.m-x.ca/en/trading/data/quotes?symbol=SXF` returned HTTP 200 to a plain curl request (no bot challenge, no cookies needed). Served by Apache behind Amazon CloudFront, `cache-control: no-store`. Not yet tested from Cloudflare's servers; test that first when building.
- **Structure:** each contract is a table row (`<tr id="SXFZ26" data-row='{...}'>`) whose `data-row` attribute holds HTML-escaped JSON with `symbol`, `expiry_date`, `last_price`, `bid_price`, `ask_price`, `settlement_price`, `net_change`, `open_interest`, `volume`, `open/high/low_price`, `nb_trades`. Parse that JSON, not the visible cells.
- **Delay:** the page says "Last update: November 4, 2026 at 2:20 a.m. (Real-time)" and the time advanced to 2:21 a.m. on a refetch 20 seconds later. So it's effectively real time, better than Yahoo's ~10-minute delay.
- **Front month:** December 2026 (`SXFZ26`, expires 2026-12-18) had all the open interest (147,951) and volume (354). Every other month (Mar/Jun/Sep 2027, Dec 2027–2030) showed zero bid/ask/volume. Rule to use: pick the contract with the highest open interest; that handles quarterly rolls automatically.
- **Sample at 2:20 a.m.:** last 2,120.6, bid 2,120.3, ask 2,120.8, settlement 2,113.2, net change +7.4 (+0.35%).
- **Trading hours:** SXF already had 346 trades by 2:20 a.m., consistent with MX's 2021 extended hours (sessions start 8:00 p.m. ET the previous evening, close 4:30 p.m. ET). Not confirmed on a current MX hours page (the URL tried returned 404).
- **Cloudflare Access is not enabled** on Matt's account (API returns "Access is not enabled"). Per Cloudflare's setup docs, Matt must enable Zero Trust once in the dashboard: pick a team name, choose the Free plan, and enter payment details (required even on Free; not charged).
- **Hostname gotcha:** a two-level name like `me.implied-open.soesraider.com` isn't covered by Cloudflare's free certificate (it only covers one level, `*.soesraider.com`). Use a one-level name such as `implied-open-me.soesraider.com`.
- **Design notes for build:** besides Access on the hostname, the Pages Function should itself check the Access login token (`Cf-Access-Jwt-Assertion`) and refuse requests without a valid one, so the data can't leak through the `*.pages.dev` address or a preview link even if an Access setting is missed. Private site should share the public page's code rather than be a hand-copied second page.
- **Matt's answers, 2026-11-04:** (1) Option A: public site unchanged, separate private copy. (2) Private hostname `implied-open-pvt.soesraider.com`. (3) Show both TSX estimates: SXF-based as the main one, S&P 500-futures-based as a comparison line. (4) He'll enable Zero Trust (Free plan, card on file) himself. (5) Permission email drafted for Matt to send himself (to TMX Datalinx, marketdata@tmx.com, which handles MX data authorization); **never send email on Matt's behalf**. Login method: emailed one-time code (default); "Sign in with Google" can be added later.
- Login reality told to Matt: one login per browser/device per month at most (Cloudflare's max session is one month); clearing cookies or private windows mean logging in again.
- **Build plan / safety notes:**
  - The public Pages project `implied-open` has root dir = repo root and reads Pages Functions from `/functions`. **Never create a top-level `functions/` folder**, or the public site would pick it up. Private code lives under `private/` (its own `private/functions/`).
  - Private Pages project: root dir `private`, a build step copies `../site` and adds the SXF script, so there's one page to maintain. Previews turned off for it.
  - A `_middleware.js` on the private project checks the Access login token on every request (page and data) and **fails closed**: no valid token, or Access settings missing, means 403. That makes the order of setup safe (Cloudflare docs: a custom domain can't be added to Pages once Access already covers that hostname, so domain first, Access after).
  - Access app to cover `implied-open-pvt.soesraider.com` and `implied-open-pvt.pages.dev` (see Cloudflare Pages "Known issues: Enable Access on your *.pages.dev domain"), allow only menageyyc@gmail.com, session 1 month.

**Tools:** the Cloudflare API connector (`mcp__CloudFlare_MCP__*` tools: search / execute / docs) does Pages, DNS and Access. Supabase connector for the existing function. Show Matt screenshots (and the private URL working after login, plus proof that a logged-out request is blocked) and get his approval before merging any site change.

## To revisit: Montreal Exchange (TSX 60 futures, SXF)
- The m-x.ca quotes page shows live SXF bid/ask/settlement in its HTML, but the MX terms of use say content may be accessed and viewed for "strict personal, private and non-commercial use" only. They forbid retrieving, posting on the Internet or providing it to the public without the Bourse's prior authorization.
- **Rule: MX data must never appear on the public site.** Don't republish it anywhere public.
- Idea to evaluate: a **separate private, password-protected page for Matt only**, so he has his own tool that doesn't rely on Claude. For example, a second Cloudflare Pages route behind Cloudflare Access (email one-time code), with its own function fetching SXF.
- Before building it, read the MX terms again carefully. A private page is closer to "personal use", but it still involves automated retrieval, which the terms also restrict. The clean route is to ask the Bourse for permission (offer drafted, not yet written) or use a licensed data vendor. Give Matt a clear recommendation and let him decide.
- Second session: terms re-read in full (no date on the page; the Bourse can change them without notice). The licence is to "access, view and download or print a copy" for personal use; "retrieve", "reproduce" and "create works derived from the Content" all need the Bourse's prior authorization, and that list isn't limited to public use. A private page that fetches SXF automatically is retrieval and reproduction, so a password doesn't fix it. There's no clause on scraping and no named permissions contact.
- Recommendation given to Matt: (1) add a plain link to the m-x.ca SXF quote page (a link copies no data, so it's fine even on the public site); (2) if he wants the private calculated page, email the Bourse first and build only after a written yes. **Superseded 2026-11-04:** Matt decided to build the private MX feed now (see Pending above).
