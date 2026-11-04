# Handoff

_Last updated: 2026-11-04_

## Status
- The data relay is deployed and working: Supabase project "Menage", Edge Function `implied-open`, version 3. It covers four indexes, including the Nasdaq Composite (it uses NQ futures as a stand-in).
- The page (`site/`) is built and tested in a headless browser: desktop, tablet and phone widths, light and dark, live data, simulated market-open and weekend times.
- Not yet hosted. Plan: Cloudflare Pages on soesraider.com. Domain DNS is already on Cloudflare and nothing points at it yet.
- The old private Claude artifact version was deleted at Matt's request.

## Next steps
1. Matt approves the site PR, then it merges into main.
2. Cloudflare Pages: Workers & Pages → Create → Pages → Connect to Git → `menageyyc/implied-open`. Framework preset "None", build command empty, build output directory `site`. Then Custom domains → `soesraider.com` (root or subdomain, Matt to choose).
3. After it goes live, check that the URL loads, live prices appear, and the response carries `X-Robots-Tag: noindex`.

## Known limits
- Yahoo Finance's chart feed is unofficial. If it breaks, the function needs updating.
- Futures prices are about 10 minutes delayed.
- Market holidays aren't handled.
- The Composite estimate is a proxy.
