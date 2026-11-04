# Handoff

_Last updated: 2026-11-04 (hosting session)_

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
- **Deploys are automatic.** Every merge to main republishes the site in about a minute. Nothing to run by hand.
- **Previews:** every other branch (e.g. a `claude/*` branch with an open PR) gets its own preview link, `https://<branch>.implied-open.pages.dev`, and Cloudflare posts it on the PR. Use that link to show Matt website changes before merging.
- **Custom domain:** `implied-open.soesraider.com`, added to the Pages project, plus one DNS record in the soesraider.com zone: `CNAME implied-open → implied-open.pages.dev`, proxied. No other records in that zone were changed (the rest are Matt's existing GoDaddy/cPanel mail records).
- Also reachable at `https://implied-open.pages.dev` (same site).
- **Non-crawlable, checked live 2026-11-04:** the response carries `X-Robots-Tag: noindex, nofollow, noarchive` (from `site/_headers`), `/robots.txt` disallows everything, and the page has the noindex meta tag.
- **Checked live 2026-11-04:** loads over HTTPS, calls the Supabase function `implied-open` (HTTP 200), live prices and the Canada section render, no page errors.
- The hosting was set up through the Cloudflare API connector; Cloudflare's GitHub app was already installed on Matt's GitHub account, so no browser step was needed.
- To manage it by hand: Cloudflare dashboard → Workers & Pages → `implied-open`.

## Pending
- Nothing on hosting. The Montreal Exchange question below is being handled in a separate session.

## To revisit: Montreal Exchange (TSX 60 futures, SXF)
- The m-x.ca quotes page shows live SXF bid/ask/settlement in its HTML, but the MX terms of use say content may be accessed and viewed for "strict personal, private and non-commercial use" only. They forbid retrieving, posting on the Internet or providing it to the public without the Bourse's prior authorization.
- **Rule: MX data must never appear on the public site.** Don't republish it anywhere public.
- Idea to evaluate: a **separate private, password-protected page for Matt only**, so he has his own tool that doesn't rely on Claude. For example, a second Cloudflare Pages route behind Cloudflare Access (email one-time code), with its own function fetching SXF.
- Before building it, read the MX terms again carefully. A private page is closer to "personal use", but it still involves automated retrieval, which the terms also restrict. The clean route is to ask the Bourse for permission (offer drafted, not yet written) or use a licensed data vendor. Give Matt a clear recommendation and let him decide.
- Second session: terms re-read in full (no date on the page; the Bourse can change them without notice). The licence is to "access, view and download or print a copy" for personal use; "retrieve", "reproduce" and "create works derived from the Content" all need the Bourse's prior authorization, and that list isn't limited to public use. A private page that fetches SXF automatically is retrieval and reproduction, so a password doesn't fix it. There's no clause on scraping and no named permissions contact.
- Recommendation given to Matt: (1) add a plain link to the m-x.ca SXF quote page (a link copies no data, so it's fine even on the public site); (2) if he wants the private calculated page, email the Bourse first and build only after a written yes. Waiting on Matt's decision.
