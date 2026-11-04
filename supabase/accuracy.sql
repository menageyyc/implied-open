-- Accuracy tracker: database setup on Supabase project "Menage" (applied 2026-11-04 as
-- migrations implied_open_accuracy and implied_open_summary_roll_flag). Kept here for reference
-- and for rebuilding. The edge function is supabase/functions/implied-open-accuracy/index.ts.
--
-- Secrets live in Supabase Vault (values are NOT in this repo):
--   implied_open_log_url     the edge function URL
--   implied_open_log_secret  shared secret the function checks on POST (header x-log-secret)
-- To create them:  select vault.create_secret('<value>', '<name>', '<description>');

create schema if not exists implied_open;
revoke all on schema implied_open from public, anon, authenticated;

create table implied_open.snapshots (
  target_date date not null,          -- the trading day whose 9:30 a.m. ET open is being estimated
  key text not null,                  -- spx, ndx, ixic, dji, tsx
  horizon_min int not null,           -- minutes from the futures price's time to 9:30 a.m. ET on target_date
  data_time timestamptz not null,     -- time of the futures price used
  implied numeric not null,           -- implied open
  pct numeric not null,               -- implied move vs prev_close, percent
  prev_close numeric not null,        -- index close used
  close_date date not null,
  fut_ref numeric not null,           -- futures price at that close
  fut_now numeric not null,           -- futures price used
  source text not null check (source in ('live','backfill')),
  logged_at timestamptz not null default now(),
  primary key (target_date, key, horizon_min)
);

create table implied_open.actuals (
  trade_date date not null,
  key text not null,
  prev_close numeric,                 -- previous trading day's close
  open_official numeric,              -- the index's first printed (official) open
  price_935 numeric,                  -- index level at 9:35 a.m. ET (close of the 9:30-9:35 five-minute bar)
  updated_at timestamptz not null default now(),
  primary key (trade_date, key)
);

alter table implied_open.snapshots enable row level security;
alter table implied_open.actuals enable row level security;
revoke all on implied_open.snapshots, implied_open.actuals from public, anon, authenticated;

-- Futures contract-switch ("roll") window: Tuesday of a quarterly expiry week (3rd Friday of
-- Mar/Jun/Sep/Dec) through the Monday after. Yahoo's continuous futures series switch contracts
-- in that window at different times for intraday and daily data, which distorts the estimate.
create or replace function implied_open.is_roll_day(d date) returns boolean
language sql immutable set search_path = '' as $$
  select extract(month from d) in (3, 6, 9, 12, 1) and exists (
    select 1 from (
      select (date_trunc('month', make_date(y, m, 1))::date
              + ((5 - extract(dow from make_date(y, m, 1))::int + 7) % 7) + 14) as expiry
      from (values (extract(year from d)::int), (extract(year from d)::int - 1)) yy(y), (values (3), (6), (9), (12)) mm(m)
    ) e where d between e.expiry - 3 and e.expiry + 3)
$$;

-- One JSON document with everything the accuracy page draws.
create or replace function implied_open.summary() returns jsonb
language sql stable set search_path = '' as $$
with j as (
  select s.key, s.target_date, s.horizon_min, s.implied, s.prev_close, s.source,
         a.open_official as o, a.price_935 as p, a.prev_close as a_prev,
         implied_open.is_roll_day(s.target_date) as roll
  from implied_open.snapshots s
  join implied_open.actuals a on a.trade_date = s.target_date and a.key = s.key
  where a.open_official is not null
),
curve as (
  select key, horizon_min, not roll as clean, count(*) as n,
    sum(abs(implied - o) / o * 100) as se_o, sum(abs(prev_close - o) / o * 100) as sb_o,
    sum(case when sign(implied - prev_close) = sign(o - prev_close) then 1 else 0 end) as sh_o,
    sum(case when abs(implied - o) < abs(prev_close - o) then 1 else 0 end) as sw_o,
    count(p) as n_p,
    sum(abs(implied - p) / p * 100) as se_p, sum(abs(prev_close - p) / p * 100) as sb_p,
    sum(case when p is null then 0 when sign(implied - prev_close) = sign(p - prev_close) then 1 else 0 end) as sh_p,
    sum(case when p is null then 0 when abs(implied - p) < abs(prev_close - p) then 1 else 0 end) as sw_p
  from j group by key, horizon_min, not roll
),
daily as (
  select key, target_date, bool_or(roll) as roll,
    max(o) as o, max(p) as p, max(prev_close) as prev_close,
    bool_or(source = 'live') as live,
    jsonb_object_agg(horizon_min, round(implied, 2)) filter (where horizon_min in (0, 10, 20, 30, 60, 120, 240, 480)) as est
  from j group by key, target_date
)
select jsonb_build_object(
  'generatedAt', now(),
  'lastLogged', (select max(logged_at) from implied_open.snapshots),
  'lastLive', (select max(data_time) from implied_open.snapshots where source = 'live'),
  'closeMismatches', (select count(*) from j where a_prev is not null and abs(a_prev - prev_close) > 0.01),
  'curve', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'h', horizon_min, 'clean', clean, 'n', n,
      'se_o', round(se_o, 4), 'sb_o', round(sb_o, 4), 'sh_o', sh_o, 'sw_o', sw_o,
      'n_p', n_p, 'se_p', round(se_p, 4), 'sb_p', round(sb_p, 4), 'sh_p', sh_p, 'sw_p', sw_p) order by key, horizon_min) from curve), '[]'::jsonb),
  'daily', coalesce((select jsonb_agg(to_jsonb(d) order by key, target_date) from daily d), '[]'::jsonb)
);
$$;
revoke all on function implied_open.summary() from public, anon, authenticated;
revoke all on function implied_open.is_roll_day(date) from public, anon, authenticated;

-- Every 5 minutes (job name implied-open-accuracy-tick). The function decides what to do:
-- a snapshot while a futures price counts toward an upcoming open (6 p.m. to 9:30 a.m. ET),
-- and the actual opens on weekdays 9:40-10:30 a.m. and 4:30 p.m. ET.
select cron.schedule('implied-open-accuracy-tick', '*/5 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'implied_open_log_url'),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-log-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'implied_open_log_secret')),
    body := '{"action":"tick"}'::jsonb,
    timeout_milliseconds := 60000)
  where 2 = (select count(*) from vault.decrypted_secrets where name in ('implied_open_log_url', 'implied_open_log_secret'));
$$);

-- Rebuilding history (one-off, already done 2026-11-04 for target dates 2026-08-26 to 2026-11-04):
-- POST {"action":"backfill","key":"spx","from":"2026-10-01","to":"2026-10-15"} with the secret header,
-- one index and about two weeks per call (bigger ranges hit the free plan's compute limit).

-- Housekeeping (added 2026-11-04): pg_cron never clears its own run log, which would otherwise
-- grow about 75 MB a year from the 5-minute tick alone and eventually fill the Free plan's 500 MB.
-- Daily at 08:17 UTC, keep only the last 7 days. This applies to every cron job in the Menage
-- project (they share the log), which is harmless: it's only a history of runs.
select cron.schedule('cron-run-log-cleanup', '17 8 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);
