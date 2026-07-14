-- TFF Terminal — Supabase schema
-- Run this once in your Supabase project's SQL editor.

create table if not exists pool_snapshots (
  pool text primary key,                 -- 'options' | 'crypto' | 'yield'
  data jsonb not null,                   -- full snapshot payload for that pool
  source text not null default 'manual', -- 'agentic_bot' | 'claude_session' | 'manual'
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

alter table pool_snapshots enable row level security;
alter table priority_actions enable row level security;

create policy "public read snapshots" on pool_snapshots
  for select using (true);

create policy "public read actions" on priority_actions
  for select using (true);

insert into pool_snapshots (pool, data, source)
values
  ('options', '{"status":"awaiting first sync"}', 'manual'),
  ('crypto',  '{"status":"awaiting first sync"}', 'manual'),
  ('yield',   '{"status":"awaiting first sync"}', 'manual')
on conflict (pool) do nothing;
