# Handoff

_Last updated: 2026-11-04 (end of first session)_

## Status
- The data relay is deployed and working: Supabase project "Menage", Edge Function `implied-open`, version 3. It covers four indexes, including the Nasdaq Composite (it uses NQ futures as a stand-in).
- The page (`site/`) is built and tested in a headless browser: desktop, tablet and phone widths, light and dark, live data, simulated market-open and weekend times.
- Site merged into main (PR #2, approved by Matt). Not yet hosted. Plan: Cloudflare Pages connected to this repo, served at **implied-open.soesraider.com** (Matt's choice). Domain DNS is already on Cloudflare.
- The old private Claude artifact version was deleted at Matt's request.

## Next steps
1. Cloudflare Pages: Workers & Pages → Create → Pages → Connect to Git → `menageyyc/implied-open`. Framework preset "None", build command empty, build output directory `site`. Then Custom domains → `implied-open.soesraider.com`.
2. After it goes live, check that the URL loads, live prices appear, and the response carries `X-Robots-Tag: noindex`.

## Known limits
- Yahoo Finance's chart feed is unofficial. If it breaks, the function needs updating.
- Futures prices are about 10 minutes delayed.
- Market holidays aren't handled.
- The Composite estimate is a proxy.

## Pending
- **PR #4 (Canada section)** on branch `claude/canada` is waiting for Matt's approval. It adds a TSX estimate from S&P 500 futures, plus oil, gas, gold, CAD and the Canada 10-year yield as drivers. Function v4 is already deployed and backward-compatible with main.
- **Cloudflare is now connected as a claude.ai connector** (from 2026-11-04). Next session: check what the connector can do. Set up Cloudflare Pages from this repo (output dir `site`) with the custom domain `implied-open.soesraider.com` if the connector allows. Otherwise walk Matt through the dashboard steps. Then check the live URL: it loads, live prices appear, and it sends `X-Robots-Tag: noindex`.

## To revisit: Montreal Exchange (TSX 60 futures, SXF)
- The m-x.ca quotes page shows live SXF bid/ask/settlement in its HTML, but the MX terms of use say content may be accessed and viewed for "strict personal, private and non-commercial use" only. They forbid retrieving, posting on the Internet or providing it to the public without the Bourse's prior authorization.
- **Rule: MX data must never appear on the public site.** Don't republish it anywhere public.
- Idea to evaluate: a **separate private, password-protected page for Matt only**, so he has his own tool that doesn't rely on Claude. For example, a second Cloudflare Pages route behind Cloudflare Access (email one-time code), with its own function fetching SXF.
- Before building it, read the MX terms again carefully. A private page is closer to "personal use", but it still involves automated retrieval, which the terms also restrict. The clean route is to ask the Bourse for permission (offer drafted, not yet written) or use a licensed data vendor. Give Matt a clear recommendation and let him decide.
