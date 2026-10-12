-- One upload + buy-box.
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  file_name text,
  buy_box jsonb not null,
  rows_in int not null,
  duplicates int not null,
  columns jsonb not null
);

-- One cleaned lead. Scores are NOT stored: they are recomputed from
-- lead + signals + buy_box on every read, so editing the buy-box re-ranks
-- instantly without re-crawling.
create table if not exists leads (
  id bigserial primary key,
  job_id uuid not null references jobs(id) on delete cascade,
  lead jsonb not null,
  domain text,
  status text not null default 'pending', -- pending | working | done
  signals jsonb,
  opener text,
  updated_at timestamptz not null default now()
);
create index if not exists leads_job_status on leads (job_id, status);

-- Website/domain lookups are shared across jobs for 7 days, so re-running a
-- list (or two lists that overlap) never hits the same site twice.
create table if not exists domain_cache (
  domain text primary key,
  signals jsonb not null,
  fetched_at timestamptz not null default now()
);

-- Per-visitor usage counters, one row per (action+visitor, hour). Kept in the
-- database because serverless instances don't share memory.
create table if not exists rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);
