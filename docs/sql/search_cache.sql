-- Cache das buscas na web (Tavily = texto, YouTube = vídeo), por conquista.
-- Rodar uma vez no Supabase: SQL Editor -> New query -> colar -> Run.
-- O app funciona mesmo sem esta tabela (só não economiza cota até ela existir).

create table if not exists public.search_cache (
  appid              text        not null,
  apiname            text        not null,
  text_content       text,                 -- texto devolvido pelo Tavily
  has_enough_content boolean,              -- se o texto passou do mínimo de tamanho
  text_cached_at     timestamptz,
  video_url          text,                 -- só vídeos encontrados (falha/sem resultado não é salvo)
  video_cached_at    timestamptz,
  primary key (appid, apiname)
);

-- Mesmo padrão da generation_log: RLS ligado e SEM policy pública.
-- Só a service role (rotas de API no servidor) lê e escreve; o navegador não acessa.
alter table public.search_cache enable row level security;
