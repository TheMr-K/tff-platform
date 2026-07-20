-- TFF Terminal — full Supabase schema (kept in sync with what's actually live)

create table if not exists pool_snapshots (
  pool text primary key,
  data jsonb not null,
  source text not null default 'manual',
  updated_at timestamptz not null default now()
);

create table if not exists priority_actions (
  id bigint generated always as identity primary key,
  pool text not null,
  priority text not null check (priority in ('high','med','low')),
  message text not null,
  status text not null default 'open' check (status in ('open','done','dismissed')),
  created_at timestamptz not null default now()
);

create table if not exists weekly_watch (
  id bigint generated always as identity primary key,
  ticker text not null,
  event_type text not null check (event_type in ('earnings','catalyst','macro')),
  event_date date not null,
  description text not null,
  confirmed boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists capital_history (
  id bigint generated always as identity primary key,
  total_value numeric not null,
  options_value numeric not null default 0,
  crypto_value numeric not null default 0,
  yield_value numeric not null default 0,
  recorded_at timestamptz not null default now()
);

create table if not exists market_news (
  id bigint generated always as identity primary key,
  ticker text not null,
  headline text not null,
  source text not null,
  published_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table pool_snapshots enable row level security;
alter table priority_actions enable row level security;
alter table weekly_watch enable row level security;
alter table capital_history enable row level security;
alter table market_news enable row level security;

create policy "public read snapshots" on pool_snapshots for select using (true);
create policy "public read actions" on priority_actions for select using (true);
create policy "public read weekly_watch" on weekly_watch for select using (true);
create policy "public read capital_history" on capital_history for select using (true);
create policy "public read market_news" on market_news for select using (true);

-- Auto-logs a combined-capital snapshot every time any pool updates
create or replace function log_capital_history() returns trigger as $$
declare
  opts numeric := 0; cryp numeric := 0; yld numeric := 0;
begin
  select coalesce((data->>'total_value')::numeric, (data->>'deployed')::numeric, 0) into opts from pool_snapshots where pool = 'options';
  select coalesce((data->>'total_value')::numeric, (data->>'deployed')::numeric, 0) into cryp from pool_snapshots where pool = 'crypto';
  select coalesce((data->>'total_value')::numeric, (data->>'deployed')::numeric, 0) into yld from pool_snapshots where pool = 'yield';
  insert into capital_history (total_value, options_value, crypto_value, yield_value)
  values (coalesce(opts,0)+coalesce(cryp,0)+coalesce(yld,0), coalesce(opts,0), coalesce(cryp,0), coalesce(yld,0));
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_log_capital_history on pool_snapshots;
create trigger trg_log_capital_history
after insert or update on pool_snapshots
for each row execute function log_capital_history();
