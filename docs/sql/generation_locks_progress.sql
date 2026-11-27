-- Guarda QUAL conquista está sendo gerada na trava de geração (generation_locks), para a tela
-- mostrar "gerando…" quando o usuário sai e volta no meio de uma geração.
-- Rodar uma vez no Supabase: SQL Editor -> New query -> colar -> Run.
-- Sem estas colunas o app continua funcionando (a trava segue valendo), só não mostra o indicador ao voltar.

alter table public.generation_locks
  add column if not exists appid   text,
  add column if not exists apiname text;
