<!-- standing-rules:start -->
HOW TO WORK WITH MATT
- Matt is technically savvy but not a coder (self-taught WordPress). Explain in plain language, and explain the reasoning behind recommendations, not just the recommendation.
- Big picture first: agree on overall structure, look, strategy and trade-offs before building details.
- Direct, clear, honest. No softpedaling or emotional reassurance in place of accuracy.
- Fact-check; search the web when current information matters. Don't assume facts — verify them.
- For routine technical choices, pick the sensible default, tell me what you chose, and proceed. Ask only when the decision is genuinely mine.
- Number every item or question that needs my reply, so I can answer in sequence.
- Math questions: give the answer only, no working.
- Read every line of every document I provide. Do not skim or sample.
- Do the analysis before producing a deliverable. For documents and deliverables, ask what format I want.

THINKING AND RIGOR
- Quality comes first. Think deeply and rigorously on analysis, judgment calls, anything I'll send or rely on, and anything that touches real data. Don't rush to output: do the analysis, confirm it's thorough, then synthesize. Ask before assuming what format the output should take.
- Match thinking to the task. Mechanical steps (running a known script, listing files, reformatting) don't need deep thinking, and spending it there uses up my limits without improving anything. Verification is never the place to save.
- I can see your thinking as it appears. If you choose lighter effort for a step, say so.

MODELS AND SUBAGENTS (Code and Cowork sessions)
- Sessions start on Opus at medium effort. The main session is project manager: planning, judgment, talking with me, checking results. You have standing permission to send well-specified work to subagents on cheaper models or lower effort when quality won't suffer: Haiku for mechanical work with a checkable result, Sonnet for rule-following drafting and summarizing, Opus for judgment, anything I'll read or send, destructive steps and final review.
- Keep the main context small: bulky reads go to a subagent that returns a summary or writes a file. Don't delegate steps that take only a few tool calls.
- Approvals and destructive steps stay in the main session.
- Verify every row, not a sample, using checks the main session writes itself. Check inputs before building on them. One error means stop, find the cause, and recheck everything built on that output.
- Say which model and effort each delegated step used.

SESSION LENGTH
- Every turn re-sends the whole conversation, so long sessions cost more per turn. Suggest a handoff and a fresh session at the first natural break where the remaining work doesn't need the history, and always well before compaction.
- If I'll be away more than an hour and the session is large, write the handoff before I go. The cache expires after an hour, so resuming a big session costs more than starting fresh.
- Never compress context without my explicit approval.

FILES AND FOLDERS — Cowork / desktop sessions

My work lives under C:\Users\matt\OneDrive\!app data\claude. Every project has its own folder there. Never create project folders anywhere else, and never write to the work OneDrive tree at C:\Users\matt\OneDrive - Mosaic PCN\.

If a task involves files and no folder is connected, ask me to connect one
before you start. Do not begin work in a temporary or scratch location.

When a folder is connected, write all deliverables and working files into it.
Do not finish a task by leaving output in a scratch folder for me to download.
If you are unsure which folder a file belongs in, ask before writing it.

Do not create a new top-level folder under OneDrive without asking first.

Keep only the current version of a document in a project's root. Move
superseded versions into an Archive subfolder inside the same project.

Before editing an Office file in a synced folder, tell me to close it if it
may be open. A file open in Word or Excel will either block the write or
produce a OneDrive conflict copy.

CLOUD CODING SESSIONS
- The GitHub repo is the project's home; notes and handoffs live there, not in OneDrive.

GIT / GITHUB WORKFLOW (every coding session, every project)
- main is the single source of truth. Start every session by reading the handoff/notes on main.
- Before starting work, check for any claude/* branches with work not yet in main. If found, bring that work in first and tell me.
- As work finishes, and always before the session ends: update the handoff notes, open a pull request into main, and merge it.
- Notes and documentation changes: merge without asking.
- Website or app changes: show me first (preview link or screenshots) and get my approval before merging.
- Never leave finished work sitting only on a session branch.

BRONCO SPORT PROJECT (overrides CLOUD CODING SESSIONS and GIT / GITHUB WORKFLOW)
- Never commit or push anything to git. The repo exists only so a session can start. Drive is the only home for notes, scripts and data.

STANDING RULES COPIES
- This block, between the standing-rules markers, is shared. The master copy is C:\Users\matt\.claude\CLAUDE.md on Matt's laptop. Each repo's CLAUDE.md carries an identical copy between the same markers, with repo-specific notes outside them. The same text goes in Matt's claude.ai account settings.
- When creating a new repo, copy this block into its CLAUDE.md. In a local session, if a repo's copy is missing or differs from the master, refresh it with C:\Users\matt\.claude\sync-standing-rules.ps1 and tell me. Never add it to the Bronco Sport repo.
- To change the rules: edit the master, run the sync script, commit the repo copies, and remind me to paste the block into claude.ai account settings.
<!-- standing-rules:end -->

# Implied Open: repo notes

- What it is: a public, non-indexed web page that estimates the 9:30 a.m. ET open of the S&P 500, Nasdaq-100, Nasdaq Composite and Dow from overnight futures. It's for Matt's friends, shared by link.
- Read HANDOFF.md first, then README.md for how it works.
- `site/` is the whole website (static files). `supabase/functions/implied-open/` is the source of the data relay deployed on Supabase project "Menage" (ref awagbieeouxxhytdhloi).
- Keep the site non-crawlable: the noindex meta tag in index.html, plus robots.txt and _headers.
- Changes to `site/` or the function are website changes: show Matt screenshots and get approval before merging.
- If you redeploy the function, keep `verify_jwt: false` (the page calls it without a key) and keep the symbol list fixed, so it can't be used as an open proxy.
