# TMX Montréal Exchange: permission reply (received by Matt 2026-11-04)

Transcribed from Matt's screenshot of the email. Subject: "RE: Permission request: personal, non-commercial use of SXF quotes from m-x.ca". Our original request: `notes/mx-permission-email.md`.

> Good day,
> Thank you for contacting the TMX Montréal Exchange (MX).
> Your non-commercial use of live and delayed SXF data are hereby granted for use at the URL https://implied-open.soesraider.com/ . Please ensure the use of web crawlers and scrapers are enforced on this page. You may not sell MX data under these terms.
>
> Kind Regards,
> Henri Picard,
> Market Data Division
> TMX Montréal Exchange

## What it means for this project (our reading, 2026-11-04)
- Allowed: live and delayed SXF data, non-commercial, at https://implied-open.soesraider.com/ (that hostname only: not implied-open.pages.dev, not preview links, not a public supabase.co endpoint).
- Condition: blocks on web crawlers and scrapers must be enforced on the page (the sentence literally says "use of ... are enforced"; read as "restrictions on"). Keep noindex / robots.txt / X-Robots-Tag, and add scraper protection for the SXF data (see HANDOFF "Build brief: SXF on the public site").
- Never sell MX data. No attribution wording was required; we credit the Montréal Exchange anyway.
- Logging SXF for the /accuracy page: read as covered (it's for that page, and only derived estimates/misses are shown publicly). Matt said yes on 2026-11-04. If certainty is wanted, a one-line reply to Henri settles it.
