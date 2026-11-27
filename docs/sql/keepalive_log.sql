-- Histórico do ping diário do banco (ver src/app/api/cron/keepalive/route.ts).
-- Rodar uma vez no Supabase: SQL Editor -> New query -> colar -> Run.
-- Serve de prova durável de que o cron roda todo dia (os logs do Vercel Hobby duram só 1 hora).
-- Para conferir: Table Editor -> keepalive_log -> deve haver uma linha por dia.
-- O ping funciona mesmo sem esta tabela (só deixa de registrar a hora).

create table if not exists public.keepalive_log (
  id        bigint generated always as identity primary key,
  pinged_at timestamptz not null default now()
);

-- Mesmo padrão das outras tabelas internas: RLS ligado e SEM policy pública (só a service role, no servidor).
alter table public.keepalive_log enable row level security;
