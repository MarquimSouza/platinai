# PROJECT_STATE.md
> Última atualização: 26/11/2026 — reflete o estado mais recente do projeto (HEAD `533dc72`). Este arquivo é sempre sobrescrito por completo, nunca editado incrementalmente.
> Para retomar o projeto num chat/Projeto novo: leia este arquivo, depois `ROADMAP.md` (o que falta) e o final do `DECISIONS.md` (o porquê das decisões recentes). O código está em github.com/MarquimSouza/platinai.

## Visão geral

**Nome:** Platinai (antes steam-trophies)
**Repositório:** github.com/MarquimSouza/platinai
**Produção:** https://platinai.vercel.app
**O que é:** SaaS de tracker de conquistas/platina da Steam. Login com Steam, biblioteca de jogos, conquistas ordenadas por raridade, guias gerados por IA (busca real na web) para as conquistas difíceis, com vídeo do YouTube e mini player embutido. Interface e conteúdo bilíngues (PT-BR/EN). Tema claro/escuro. PWA instalável (testado em PC e Android).
**Novidade desde 26/09:** **modo visitante** — quem não está logado vê um catálogo público com os jogos que a comunidade já gerou dicas, e pode ler as dicas sem login. Três planos: visitante (só lê), grátis com conta Steam (gera com limite) e premium (sem limite diário).

**Objetivo duplo:** produto real + peça de portfólio.
**Situação:** projeto em **stand by para lançamento** — por decisão do autor, domínio próprio e Play Store (TWA) ficam para depois; por ora só lapida o que já existe.

## Stack

- Next.js 16 (App Router, TypeScript, Tailwind v4, `src/`) — atenção: é uma versão com mudanças em relação ao conhecimento comum (ver `AGENTS.md`)
- next-auth v4.24.15 fixado + next-auth-steam 0.4.0
- Supabase (Postgres) — RLS restrito; escrita só via Service Role Key; **plano grátis pausa o banco após ~7 dias sem atividade** (resolvido com o ping diário, abaixo)
- Steam Web API (jogos, conquistas, schema em inglês/idioma, raridade global)
- Tavily API (texto do guia, 1000 créditos/mês grátis; cada busca básica = 1 crédito → ~33 gerações/dia no total)
- YouTube Data API v3 (busca + duração; 10.000 unidades/dia grátis; ~101 por busca de vídeo → ~99/dia)
- IA para gerar o guia: **Google Gemini** (`gemini-3.6-flash`, principal; tier grátis perto do limite de RPM, responde 429/503 de vez em quando) com **fallback no Groq** (padrão `openai/gpt-oss-120b`, configurável por `GROQ_MODEL`)
- SteamGridDB (fallback de capa)
- Vercel (deploy automático via GitHub; plano Hobby: cron no máximo 1x/dia, logs de execução guardados só 1 hora)

## Identidade visual

- Logo em `public/`: `logo_app.png` / `logo_app_white.png` (ícone com MUITA margem transparente: ~33% do canvas é desenho — ver Armadilhas), `logo_app_icon.png` / `logo_app_white_icon.png` (recortadas), `logo_black.png` / `logo_white.png` (wordmark)
- Ícones PWA (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`): fundo preto + glifo branco
- Tema dark/light via `data-theme` + CSS custom properties; idioma PT/EN via contexto React (`language-provider.tsx`) e dicionário `lib/translations.ts`
- Mascote: robô de cristais azuis (divulgação no Instagram)

## Planos e limites (`src/lib/plans.ts`)

| Plano | Quem | Pode |
|---|---|---|
| Visitante | sem login | ler catálogo e dicas já salvas; **não gera** (pede login Steam) |
| Grátis | login Steam | gerar **3 dicas por 24h** (janela móvel) + **teto global de 30/24h** para todos os grátis; sem botão "Regenerar dica" |
| Premium | Steam IDs em `PREMIUM_STEAM_IDS` (variável de ambiente) | sem limite diário nem teto global; só trava de segurança de 10/h; pode "Regenerar dica" |

- Premium é **temporário via variável de ambiente** (lista separada por vírgula, só SteamID64 de 17 dígitos); o ID do autor está só no Vercel, não no repositório. Será substituído por um campo de plano no banco na Fase 6/Stripe.
- Limites valem **só em produção** (`NODE_ENV === "production"`). Para testar a experiência do plano grátis: esvaziar `PREMIUM_STEAM_IDS` no Vercel e fazer Redeploy.
- Guia já salvo é devolvido **antes** de login e limites (ler é de graça); geração só entra na contagem (`generation_log`) no fim; falha do Gemini/Groq (503) não conta.
- Mensagens de limite não citam o número (para trocar o limite sem editar texto).

## Fluxo de geração (`src/app/api/guides/generate/route.ts`)

1. Valida entrada → procura guia salvo (cliente anon). Se existe e não é `force`: devolve na hora (qualquer pessoa).
2. Sem login → 401 `login_required`. `force` sem ser premium → 403 `premium_only`.
3. **Trava "uma geração por vez por usuário"** (tabela `generation_locks`) → 409 `already_generating`. Liberada sempre num `finally`; trava velha (>60s) é tomada.
4. Limites (só produção): premium 10/h (`rate_limited`); grátis 3/24h (`daily_limit`) e teto global 30/24h (`global_cap`, não conta premium). Falha ao contar = deixa passar (fail-open) e loga `[limits]`.
5. **Cache de buscas** (`search_cache`), salvo `force`: texto do Tavily e vídeo do YouTube por conquista. Validade: texto suficiente 30 dias, texto raso 3 dias, vídeo 30 dias. Só vídeo *encontrado* é gravado. Sem a tabela o app segue normal.
6. Busca usa **nome/descrição em inglês** (Steam `GetSchemaForGame l=english`; cai no nome original se a Steam falhar), Tavily (texto) + YouTube (vídeo, em 3 níveis de rigor) em paralelo.
7. Texto curto demais (<300 caracteres) → aviso "conteúdo insuficiente", **não salva**, devolve o vídeo.
8. IA: Gemini (1 retry após 2s em 503/429 **só se não houver Groq**); se falhar, Groq (parse estrito: JSON inválido não é salvo). Mesmo prompt nos dois.
9. IA disse "insuficiente" → aviso, não salva (devolve o vídeo). Senão salva (INSERT ou, na regeneração, UPDATE — regeneração sem vídeo novo mantém o anterior) + `generation_log`.
10. Erros: IA ocupada → 503 `ai_busy` (mensagem amigável traduzida no frontend). Códigos de erro do servidor são traduzidos em `games/[appid]/page.tsx`.

## Modo visitante / comunidade

- `/` sem login → `CommunityCatalog` (barra de pesquisa, ordenação A-Z/Z-A, cartões com capa e contagem de dicas, botão "Entrar com Steam" no canto superior direito). `/` logado → biblioteca (inalterada), com link "Explorar dicas da comunidade →".
- `/comunidade` → mesmo catálogo para logado (separado da biblioteca, para não misturar com os jogos que ele possui; mostra nick + Sair).
- `/comunidade/[appid]` → todas as conquistas do jogo com raridade; as com dica mostram texto + vídeo/player (dicas primeiro); as demais ficam travadas ("faça login com sua conta Steam" para visitante; "gere pela sua biblioteca" + link para logado). Somente leitura.
- APIs públicas: `GET /api/community/games` (jogos agrupados de `achievement_guides`, com paginação de 1000 em 1000) e `GET /api/community/games/[appid]?lang=` (schema/raridade da Steam + dicas do banco; só responde para jogos que já têm dica, para a chave da Steam não virar proxy aberto). Cache de CDN curto **só em respostas de sucesso** (catálogo 120s, jogo 300s) — por isso o catálogo pode demorar alguns minutos para refletir uma dica nova.
- Por ora mostra **todas** as dicas; ideia futura: liberar só 5 ou 10 por jogo e travar o resto pedindo login.

## Segurança

- `supabaseAdmin` (service role) só em rotas de API, nunca no navegador; `supabase` (anon) só leitura.
- RLS: `achievement_guides` só SELECT público; `generation_log`, `search_cache`, `generation_locks` com RLS ligado e **sem policy pública** (só service role).
- Rota de ping protegida por `CRON_SECRET`.
- **⚠️ Vulnerabilidade conhecida, a corrigir:** `POST /api/guides/delete` não tem autenticação e usa a service role — qualquer pessoa que descobrir a URL apaga guias de qualquer jogo. **Nenhum código do app a usa mais** (o "Regenerar dica" não apaga mais antes). Remover a rota.
- Nenhuma chave no repositório (`.env*` ignorado; exceção `!.env.example`, que só tem os nomes).

## Estrutura de arquivos relevante

```
.env.example                 → nomes de TODAS as variáveis (sem valores); copiar para .env.local
vercel.json                  → cron diário do ping (/api/cron/keepalive, 08:00 UTC)
docs/sql/                    → SQL das tabelas criadas à mão no Supabase: search_cache.sql, generation_locks.sql
public/                      → logos, ícones PWA, manifest.json, .well-known/assetlinks.json (template TWA)
src/lib/
  auth.ts                    → next-auth; sessão expõe steamId e isPremium
  plans.ts                   → limites (3/30/10) e isPremium (lê PREMIUM_STEAM_IDS)
  gemini.ts                  → generateAchievementGuide: orquestra Gemini (+retry) → Groq (fallback)
  groq.ts                    → chamada ao Groq (API compatível OpenAI)
  tavily.ts                  → searchAchievementGuide (texto) + searchYoutubeVideo (3 níveis) + parseISO8601Duration
  steam-schema.ts            → nome/descrição da conquista em inglês
  search-cache.ts            → cache de buscas (tolerante a falha)
  generation-lock.ts         → trava "uma geração por vez"
  supabase.ts, rarity.ts, translations.ts
src/components/              → GameCover, ThemeToggle, LanguageToggle, CommunityHeader, CommunityCatalog
src/app/
  page.tsx                   → logado: biblioteca; sem login: catálogo da comunidade
  games/[appid]/page.tsx     → conquistas do usuário (gerar, regenerar [premium], vídeo, erros traduzidos)
  comunidade/page.tsx, comunidade/[appid]/page.tsx
  api/guides/generate, api/guides (GET público), api/guides/delete (⚠️ remover)
  api/community/games, api/community/games/[appid]
  api/cron/keepalive, api/steam/*, api/covers/[appid], api/auth/[...nextauth]
```

## Banco de dados (Supabase)

- **`achievement_guides`**: appid, apiname, game_name, achievement_name, guide_text (PT), guide_text_en, video_url, created_at. SELECT público; INSERT/UPDATE/DELETE só service role.
- **`generation_log`**: id, ip, steam_id, created_at — base dos limites. RLS sem policy pública.
- **`search_cache`** (PK appid+apiname): text_content, has_enough_content, text_cached_at, video_url, video_cached_at. Criada com `docs/sql/search_cache.sql`.
- **`generation_locks`** (PK steam_id): locked_at. Criada com `docs/sql/generation_locks.sql`.
- Criar tabela nova = rodar o SQL no Supabase (SQL Editor). O app foi feito para seguir funcionando se uma tabela de cache/trava não existir.

## Variáveis de ambiente (só nomes; detalhes e onde obter em `.env.example`)

`NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `STEAM_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TAVILY_API_KEY`, `YOUTUBE_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY` (+ `GROQ_MODEL` opcional), `STEAMGRIDDB_API_KEY` (opcional), `CRON_SECRET`, `PREMIUM_STEAM_IDS`.
Toda variável nova precisa estar também no painel do Vercel (Settings → Environment Variables) **e exige Redeploy** para valer.

## O que funciona (testado em produção)

- ✅ Login Steam, biblioteca, conquistas com raridade, guias bilíngues com cache, vídeo + mini player, responsividade mobile, PWA instalável
- ✅ Retry do Gemini + erro amigável; **fallback Groq confirmado** (Gemini falhou num teste e o Groq gerou a dica)
- ✅ "Regenerar dica" que não perde o guia antigo quando a regeneração falha (confirmado)
- ✅ Vídeo achado pelo nome em inglês (corrigiu o caso "Nervos de Aço", Portal 2)
- ✅ **Ping diário do banco rodando sozinho** (visto nos logs do Supabase em 26/11, 08:36)
- ✅ Cache de buscas e trava de geração aplicados (tabelas criadas)
- ✅ Modo visitante testado no PC e no celular pelo autor (catálogo, página do jogo)
- ⚠️ Implementado e testado só em simulação, sem teste ponta a ponta real: limites do plano grátis (3/dia, teto 30), experiência do plano grátis na interface, retorno do login para `/comunidade/[appid]` (`callbackUrl`)

## Pendências conhecidas

1. **Segurança:** remover `/api/guides/delete` (ver Segurança). Prioridade máxima — é pequeno e fecha uma brecha real.
2. **Decisão aberta — sair da tela durante uma geração:** o autor percebeu que, ao voltar para a biblioteca no meio de uma geração, a dica "não conclui" na tela. Na prática o servidor **continua** (gasta IA/Tavily/YouTube, grava o guia no banco e conta no limite), só que o resultado não aparece porque a tela foi desmontada; ao reabrir o jogo, o guia salvo aparece se já terminou. Opções: (A) deixar concluir em segundo plano e mostrar um indicador "gerando…" ao voltar; (B) botão "Cancelar" que aborta o pedido (o aborto no servidor do Vercel não é garantido; só economiza IA se chegar antes da chamada à IA; as buscas já ficam guardadas no cache). Recomendação registrada: (A). Aguardando o autor decidir.
3. **Ping:** gravar a hora do último ping numa tabela (prova durável; os logs do Vercel Hobby duram 1h). Autor aprovou, depois de testar o modo visitante.
4. **Gemini 429:** causa exata ainda não investigada (RPM por minuto, cota diária ou tokens?) — olhar Google AI Studio → Limite de taxa da API. Hoje o Groq cobre o sintoma.
5. **Busca de reserva para o Tavily** (Exa preferida, devolve o texto das páginas; Firecrawl é alternativa; Serper só devolve trechos curtos e não serve sem mudar a lógica). Exige o autor criar a conta e conferir os limites atuais na página de preços.
6. Scroll intermitente da biblioteca ao voltar das conquistas (~1 em 5-10; sem causa raiz; não bloqueante).
7. Domínio próprio e TWA/Play Store: adiados por decisão do autor (TWA depende de chave de assinatura local + $25).
8. Retorno do login ao lugar certo e visual do cabeçalho/cartões do catálogo no celular: observar em uso.

## Próximos passos (ordem sugerida — ver ROADMAP.md)

1. Remover `/api/guides/delete`.
2. Decidir e implementar o comportamento ao sair da tela durante a geração.
3. Ping gravando a hora do último ping.
4. Investigar o limite real do Gemini no AI Studio.
5. Busca de reserva (Exa) quando houver conta.
6. Limitar quantas dicas o visitante vê por jogo (5-10) — se/quando fizer sentido.
7. Fase 6 (users/user_games, hall da platina, perfil) → Fase 7 (Stripe) → polimento → desktop.

## Decisões arquiteturais em vigor

- API keys nunca expostas ao frontend; Supabase: anon só lê, service role só no servidor.
- Guia em uma chamada de IA que devolve JSON `{pt, en, sufficient}`; conteúdo insuficiente (por tamanho ou autoavaliação) nunca é salvo.
- Buscas na web sempre em inglês (nome/descrição em inglês via Steam), tradução feita pela IA.
- Provedores de IA: Gemini principal, Groq de reserva; com a reserva configurada não há retry no Gemini.
- Cache de buscas por conquista (30d / 3d raso); só resultado bom é gravado; falha de busca nunca vira cache.
- Planos por Steam ID; limites contados em `generation_log` (janela móvel), só em produção; premium por variável de ambiente por enquanto.
- Ler dica salva é sempre livre; gerar exige login; regenerar é premium.
- Uma geração por vez por usuário, trava no banco (várias instâncias no Vercel).
- Rotas públicas só para o que já é público (dicas) e restritas a jogos já presentes na comunidade; cache de CDN só em sucesso.
- Estado da biblioteca em `sessionStorage`; "voltar" usa `router.push("/", {scroll:false})`.
- Responsividade mobile-first; PWA com ícones de fundo sólido; TWA (Google Play) escolhido sobre Capacitor; keystore nunca gerado numa sessão de IA.
- Tabelas novas criadas por SQL versionado em `docs/sql/`; o código tolera a ausência de tabelas de cache/trava.

## Armadilhas / lições aprendidas

- **PNG com margem transparente interna** quebra ícones pequenos: checar `Image.getbbox()` antes de usar.
- **`z-index` escapa sem `isolate`**; **`flex-1` pode espremer o vizinho** (use `flex-shrink-0`); **`ENOSPC` corrompe `node_modules` em silêncio** (limpar e reinstalar).
- **Modelo de IA gratuito some:** o `llama-3.3-70b-versatile` do Groq foi desativado em 16/08/2026 (a API devolve 404). Antes de fixar um modelo, ver a página de deprecações do provedor; manter o nome do modelo em variável de ambiente.
- **Modelos de raciocínio (gpt-oss)** gastam tokens "pensando": usar `reasoning_effort: low` e `max_tokens` folgado, senão a resposta vem vazia.
- **Nome da conquista no idioma da interface** quebra a busca em inglês: sempre buscar com o nome em inglês.
- **Supabase corta consultas em 1000 linhas**: paginar; o `supabase-js` manda `.range()` como `offset`/`limit` na URL.
- **Supabase grátis pausa por inatividade** (~7 dias): ping diário. **Vercel Hobby guarda logs por 1 hora**: bom para teste imediato, ruim para confirmar rotina diária (usar os logs do Supabase).
- **Variável nova no Vercel só vale depois de Redeploy.**
- **No bash, `!` dentro de aspas duplas** dispara expansão de histórico e aborta o comando: mensagens de commit sem `!`.
- A **Steam responde o mesmo erro com HTTP 200 ou 400**: decidir pelo corpo, não pelo status.
- Ao adicionar campo ao retorno de uma função, conferir todo call-site que desestrutura (TypeScript não avisa).
- Rate limit só em produção (senão trava o dev); `x-forwarded-for` vira `"unknown"` local.

## Como trabalhamos (fluxo)

- O autor muitas vezes só tem navegador (GitHub, Supabase, Vercel). O Claude trabalha num clone próprio, valida com `tsc` + `npm run build` + testes com serviços simulados, e entrega um **arquivo `.patch`**. O autor aplica no **GitHub Codespaces**: `git pull` → `git apply --check x.patch && git apply x.patch && rm x.patch` → `git status --short` → `git add -A` → `git commit -m "..." -m "..."` → `git push`.
- Todo patch vem com os comandos de commit e push (mensagem descritiva, sem `!`). SQL novo vem como arquivo para colar no SQL Editor do Supabase.
- Preferências: o Claude deve **perguntar antes de implementar** (alinhar a solução), preferir soluções gratuitas e **evitar criar contas extras** em serviços; nunca colar chaves no chat.
- O Claude não vê as telas: pedir print quando o visual importar.

## Contexto de negócio

- Monetização: freemium (Stripe), só depois de uso orgânico validado; plano premium hoje é manual.
- Prioridade atual: custo zero. Cotas compartilhadas gratuitas (Tavily, YouTube, Gemini/Groq, Supabase) são o gargalo real — por isso os limites, o cache de buscas e o teto global.
- Divulgação: Instagram (mascote + logo); o catálogo público existe para facilitar divulgar sem exigir login de cara.
