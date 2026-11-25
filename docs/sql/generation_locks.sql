-- Trava "uma geração por vez por usuário" (ver src/lib/generation-lock.ts).
-- Rodar uma vez no Supabase: SQL Editor -> New query -> colar -> Run.
-- O app funciona mesmo sem esta tabela (só não impede gerações simultâneas até ela existir).

create table if not exists public.generation_locks (
  steam_id  text        primary key,          -- a chave primária é o que garante "só uma por usuário"
  locked_at timestamptz not null default now()
);

-- Mesmo padrão da generation_log: RLS ligado e SEM policy pública (só a service role, no servidor).
alter table public.generation_locks enable row level security;
