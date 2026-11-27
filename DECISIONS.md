# DECISIONS.md
> Log de decisões técnicas do projeto Platinai (antes steam-trophies). Este arquivo é **append-only**: novas entradas são adicionadas ao final, entradas antigas nunca são reescritas ou removidas.
>
> Nota: este arquivo foi reconstruído em 13/08/2026 após perda do arquivo original. As entradas anteriores a essa data foram recuperadas a partir de histórico de aprendizados registrados em outras fontes; datas exatas de decisões individuais anteriores a 13/08 podem não estar precisas.

---
## Decisões anteriores (reconstruídas)

1. **`next-auth` deve ficar fixado na v4, nunca deixar o npm resolver para v5.**
   Motivo: `next-auth-steam` depende da API interna da v4 e é incompatível com a v5.

2. **Instalações de pacote no projeto exigem a flag `--legacy-peer-deps`.**
   Motivo: o Next.js 16 é mais novo que o range de peer dependency declarado por algumas bibliotecas de terceiros (ex: `next-auth-steam`), causando conflito de resolução do npm.

3. **`tsconfig.json` precisa do path alias `@/*` apontando para `./src/*`.**
   Motivo: o projeto usa `src/` directory; sem essa configuração, imports usando `@/` não são resolvidos pelo TypeScript.

4. **Cuidado redobrado ao editar `.env.local`: caracteres/comandos residuais colados junto de uma variável quebram a autenticação silenciosamente.**
   Motivo: valores de variável de ambiente corrompidos (ex: chave de API concatenada com outro texto) não geram erro óbvio — a falha aparece só na chamada à API externa, dificultando o diagnóstico.

5. **Cuidado com pastas `app/` duplicadas fora de `src/`.**
   Motivo: se o Next.js encontrar uma pasta `app` na raiz do projeto além da que fica dentro de `src/`, ele pode priorizar a da raiz, fazendo alterações em `src/app` parecerem não ter efeito nenhum no navegador.

6. **Regra de segurança em vigor para todo o código do projeto:**
   - API key da Steam só no backend, via variável de ambiente — nunca no frontend nem versionada no Git
   - Validar a resposta do Steam OpenID diretamente com a Steam antes de confiar em qualquer SteamID
   - HTTPS obrigatório em produção
   - Cookies/tokens de sessão com flags `HttpOnly` + `Secure`
   - Rate limiting na rota de sync
   - Validação de formato de entrada (ex: formato de SteamID) antes de repassar a APIs externas

---
## 13/08/2026 — Sessão de implementação: auth + biblioteca + conquistas

**Contexto:** primeira sessão de codificação de verdade do projeto, partindo de uma máquina recém-formatada (sem Node, Git ou Docker instalados).

**Decisões e correções:**

1. **Steam Web API key nunca deve ser colada junto de outros comandos no `.env.local`.**
   Motivo: um bug real ocorreu quando a chave da Steam ficou concatenada, no mesmo valor de variável, com um trecho do comando usado para gerar o `NEXTAUTH_SECRET` (cópia/cola acidental). Isso quebrou silenciosamente a autenticação com a Steam API (erro `Forbidden` / `Access denied`).

2. **`next-auth` deve ficar fixado na v4, nunca deixar o npm resolver para v5 — confirmado na prática.**
   Motivo: mesmo instalando `next-auth-steam` com `--legacy-peer-deps`, o npm pode puxar a v5 (beta) se a versão não for explicitada, causando erro genérico `[OAuthCallbackError]`. Sempre instalar com `npm install next-auth@4 next-auth-steam --legacy-peer-deps` e confirmar com `npm list next-auth`.

3. **`tsconfig.json` — bug real encontrado: alias apontando para a raiz em vez de `./src/*`.**
   Corrigido para:
   ```json
   "paths": {
     "@/*": ["./src/*"]
   }
   ```

4. **Configuração de auth extraída para `src/lib/auth.ts`, compartilhada entre rotas.**
   Motivo: tanto a rota de login quanto qualquer rota que precise da sessão do usuário precisam da mesma configuração de `NextAuthOptions`. Centralizar evita duplicação e bugs de sessão divergente.

5. **Rota de conquistas cruza `GetPlayerAchievements` com `GetGlobalAchievementPercentagesForApp` e ordena por raridade (menor % primeiro).**
   Motivo: essa é a proposta de valor central do produto.

6. **Pasta `app/` duplicada fora de `src/` causou a página antiga ser servida mesmo após editar `src/app/page.tsx`.**
   Resolvido apagando a pasta `app` da raiz. **Consequência descoberta depois (ver entrada de 26/08):** essa pasta duplicada continha o `globals.css` original gerado pelo `create-next-app` (com o import do Tailwind), que foi perdido junto ao apagar a pasta.

**Estado ao final da sessão:** login + biblioteca de jogos + conquistas por jogo (com raridade) funcionando de ponta a ponta, testado com a conta real do autor.

---
## 20/08/2026 — Sessão de implementação: Supabase + geração de guias por IA

**Contexto:** integração de persistência (Supabase) e da funcionalidade central do produto — geração automática de guias para conquistas raras.

**Decisões e correções:**

1. **Row Level Security (RLS) do Supabase bloqueia todo acesso por padrão até políticas explícitas serem criadas.**
   Motivo: a tabela `achievement_guides` foi criada com RLS habilitado (boa prática), mas sem nenhuma política, o que bloqueava até a própria API do projeto de inserir dados (`new row violates row-level security policy`). Resolvido criando políticas públicas de leitura e escrita:
   ```sql
   create policy "Permitir leitura pública de guias"
   on achievement_guides for select to anon using (true);

   create policy "Permitir escrita pública de guias"
   on achievement_guides for insert to anon with check (true);
   ```
   **Pendência registrada:** essas políticas são adequadas para o estágio atual (dados públicos, sem informação sensível de usuário nesta tabela), mas devem ser revisadas quando o projeto crescer — idealmente restringindo escrita a uma chave de service role usada só no backend, para impedir que qualquer cliente escreva diretamente na tabela via API pública do Supabase.

2. **Gemini API com a ferramenta nativa `google_search` (grounding) mostrou-se não-confiável no tier gratuito — decisão de arquitetura importante.**
   Motivo: testes reais retornaram erro `429 RESOURCE_EXHAUSTED` de forma consistente e imediata, independente do modelo testado (`gemini-3.7-flash`, depois `gemini-2.5-flash` — que também retornou `404` por estar descontinuado para novas contas, depois `gemini-3.6-flash`). Esse comportamento bate com relatos públicos de outros desenvolvedores sobre a combinação "conta gratuita + grounding" ser especialmente restrita/instável no momento. **Não é um bug do nosso código.**

3. **Arquitetura de geração de guia dividida em duas etapas: Tavily (busca) → Gemini (síntese), evitando depender do grounding nativo do Gemini.**
   Motivo: contorna a limitação acima mantendo pesquisa real na web. Tavily oferece tier gratuito permanente de 1.000 créditos/mês sem cartão de crédito; uma busca básica custa 1 crédito. O Gemini é usado **sem** a tool `google_search`, recebendo o conteúdo já buscado pelo Tavily como contexto no prompt, e apenas sintetizando/traduzindo. Isso, na prática, deu resultados mais confiáveis que o grounding nativo do Gemini teria dado.

4. **Cache de guias verificado no Supabase antes de qualquer chamada às APIs externas (Tavily e Gemini).**
   Motivo: evita gastar cota gratuita gerando o mesmo guia duas vezes. A rota `POST /api/guides/generate` sempre consulta `achievement_guides` por `appid` + `apiname` antes de acionar Tavily/Gemini.

5. **Frontend busca todos os guias já salvos de um jogo ao carregar a página (`GET /api/guides?appid=X`), em vez de descobrir isso só ao clicar em "Gerar dica".**
   Motivo: sem isso, o botão "Gerar dica" aparecia para conquistas que já tinham guia salvo no banco — o clique não gastava cota (o cache no backend já protegia isso), mas dava a falsa impressão de que ia gerar algo novo, prejudicando a experiência.

**Estado ao final da sessão:** geração automática de guias funcionando de ponta a ponta (Tavily busca → Gemini sintetiza → salva no Supabase → reaproveitado em acessos futuros), testado com sucesso em múltiplas conquistas do AC Black Flag Resynced.

---
## 26/08/2026 — Sessão de redesign visual (tema escuro + raridade)

**Contexto:** primeira passada de design na interface, até então só com estilos inline básicos.

**Decisões e correções:**

1. **Bug real: `src/app/globals.css` não existia no projeto — o Tailwind nunca esteve de fato ativo, mesmo com a lib instalada.**
   Motivo: conforme registrado na entrada de 13/08, o `globals.css` original (com `@import "tailwindcss";`) foi perdido junto com a pasta `app` duplicada apagada naquela sessão. Como o projeto até então só usava `style={{}}` inline nos componentes, a ausência do Tailwind passou despercebida por várias sessões. Resolvido recriando `src/app/globals.css` com a linha `@import "tailwindcss";` no topo, e confirmando que `src/app/layout.tsx` importa esse arquivo (`import "./globals.css"`).
   **Aprendizado para o futuro:** ao usar classes Tailwind em qualquer novo componente, sempre confirmar visualmente que o estilo está aplicando (fonte, espaçamento, cor) antes de assumir que só o conteúdo/lógica pode estar errado — esse bug ficou "escondido" por várias sessões porque os testes anteriores nunca dependiam do Tailwind para funcionar.

2. **Sistema de cores por raridade de conquista introduzido como elemento central do design (`src/lib/rarity.ts`).**
   Motivo: reaproveita a linguagem visual já familiar de "raridade de item" (comum/incomum/rara/épica/lendária) de jogos, mapeada diretamente ao dado real que já tínhamos (`globalPercent`). Centralizado em um único arquivo para reuso entre a tela de conquistas e futuras telas.

**Estado ao final da sessão:** tema escuro aplicado em toda a aplicação, com cards, barra de progresso, e cores de raridade por conquista.

---
## 27/08/2026 — Sessão de melhorias: qualidade dos guias, vídeo, regeneração e capa de jogo

**Contexto:** ajustes finos na funcionalidade central (geração de guias) após feedback de uso real com conquistas de outros jogos (The Witcher 3 / Gwent), além de melhorias visuais na exibição de capas de jogo.

**Decisões e correções:**

1. **Busca de guia (Tavily) agora sempre roda em inglês, com tradução feita pelo Gemini.**
   Motivo: buscas em português retornavam poucos ou nenhum resultado relevante para conquistas de jogos sem comunidade brasileira grande. O prompt do Gemini foi ajustado para deixar explícito que deve traduzir/responder em português mesmo recebendo contexto em outro idioma.

2. **Query de busca de texto passou a incluir a descrição da conquista, não só o nome, no formato "how to {nome}: {descrição} - {jogo} achievement guide".**
   Motivo: nomes de conquista criativos/não-descritivos (ex: "Mandou ver" para "atingir 187 de força em Gwent") não geram bons resultados sozinhos. A query de vídeo permanece separada e mais simples (`"{jogo} {nome} achievement"`), pois a versão mais longa piorou os resultados de vídeo nos testes.

3. **RLS do Supabase também exige política explícita de DELETE, não só select/insert.**
   Motivo: ao implementar o botão de regenerar guia, o delete falhava silenciosamente sem policy. Resolvido com:
   ```sql
   create policy "Permitir exclusão pública de guias"
   on achievement_guides for delete to anon using (true);
   ```
   **Aprendizado:** operações de escrita no Supabase devem ser testadas verificando o efeito real no banco, não só o status HTTP — checar `res.ok` explicitamente no client evita esse tipo de falha silenciosa.

4. **Coluna `video_url` adicionada à tabela `achievement_guides`**, para anexar link de vídeo do YouTube (buscado via Tavily com `include_domains: ["youtube.com"]`) junto com o texto do guia.

5. **Botão "Regenerar dica" adicionado**, visível apenas para guias gerados por IA (não para guias curados manualmente em `guides.ts`). Chama `POST /api/guides/delete` e repete o fluxo de geração.

6. **Fallback de capa de jogo em cascata implementado no componente `GameCover`, com SteamGridDB como último recurso.**
   Motivo: nem todo jogo tem as imagens oficiais da Steam disponíveis. A cascata tenta os dois tamanhos oficiais primeiro (sem custo de API) e só consulta o SteamGridDB se ambos falharem.
   **Ajuste de UX:** imagens horizontais caindo num espaço vertical ficavam cortadas feio com `object-cover`. Resolvido com efeito de fundo desfocado (`blur-2xl`, `scale-125`) + imagem nítida centralizada com `object-contain` por cima.

**Estado ao final da sessão:** pipeline de guias mais robusto e sistema de capas com fallback em 3 níveis.

---
## 01/09/2026 — Sessão de deploy: colocando o projeto no ar (Vercel)

**Contexto:** primeiro deploy em produção, com o objetivo de tornar o projeto acessível via link público para terceiros testarem, e como pré-requisito para uso como peça de portfólio.

**Decisões e correções:**

1. **`.npmrc` com `legacy-peer-deps=true` na raiz do projeto é necessário para o build funcionar no Vercel, não só localmente.**
   Motivo: o mesmo conflito de peer dependency do `next-auth-steam` com o Next.js 16 (que já exigia a flag `--legacy-peer-deps` manualmente em instalações locais) também derruba o `npm install` automático do Vercel durante o build, com o mesmo erro `ERESOLVE`. Diferente do ambiente local, não há como passar uma flag manual no comando de build padrão do Vercel — o `.npmrc` resolve isso de forma persistente, aplicando a configuração automaticamente em qualquer `npm install` rodado dentro do projeto (local ou CI/CD).
   **Armadilha real encontrada:** o arquivo foi inicialmente criado fora da raiz do projeto (dentro de uma subpasta) por engano — nesse caso o `git status` não acusa erro nenhum e o arquivo é commitado normalmente, mas o npm não o lê de fato, e o build continua falhando com o mesmo erro. Sempre confirmar que arquivos de configuração como `.npmrc` estão no mesmo nível do `package.json`.

2. **Next.js 16 exige que `params` em rotas dinâmicas seja tipado e tratado como `Promise`, não como objeto direto — isso já era seguido em rotas mais novas do projeto, mas não na rota de autenticação, que ficou desatualizada.**
   Motivo: a rota `/api/auth/[...nextauth]/route.ts` ainda usava a assinatura antiga (`ctx: { params: { nextauth: string[] } }`), que funciona sem erro em `npm run dev` local (o Next.js é mais tolerante em desenvolvimento), mas quebra na checagem de tipos rigorosa do build de produção (`next build`), com erro do tipo `RouteHandlerConfig` incompatível. Corrigido para `ctx: { params: Promise<{ nextauth: string[] }> }`, com `await ctx.params` antes de repassar ao `NextAuth`.
   **Aprendizado:** o `npm run dev` local não é suficiente para garantir que o projeto builda em produção — a checagem de tipos e a geração de páginas estáticas do `next build` são mais rígidas e podem revelar problemas invisíveis localmente. Vale rodar `npm run build` localmente antes de fazer deploy, quando possível, para pegar esse tipo de erro mais cedo.

3. **`NEXTAUTH_URL` precisa ser definida com o domínio real de produção (`https://steam-trophies.vercel.app`), nunca `localhost` nem deixada em branco.**
   Motivo: essa variável é usada durante o próprio build (para pré-renderizar páginas) e em tempo de execução (para validar o fluxo de OAuth/OpenID da Steam). Deixá-la vazia causa erro `TypeError: Invalid URL` no build (`ERR_INVALID_URL`); deixá-la como `localhost` ou com valor divergente do domínio real causa erro 500 em `/api/auth/error` ao tentar logar em produção, mesmo com o restante do site funcionando normalmente.
   **Fluxo correto documentado:** como o domínio definitivo do Vercel só é conhecido com certeza após a criação do projeto (Settings → Domains), o primeiro deploy pode ser feito com um valor provisório nessa variável; depois, atualiza-se `NEXTAUTH_URL` com o domínio real e força-se um novo deploy (Redeploy, com "Use existing Build Cache" **desmarcado**, já que uma mudança de variável de ambiente não deve reaproveitar cache de uma tentativa anterior).

4. **Variáveis de ambiente do Vercel espelham exatamente os nomes do `.env.local`**, configuradas via importação direta do arquivo (`Import .env`) na tela de criação do projeto, exceto pela `NEXTAUTH_URL` que precisa ser ajustada manualmente para o domínio de produção.

**Estado ao final da sessão:** projeto publicado com sucesso em `https://steam-trophies.vercel.app`, com deploy automático configurado a cada push na branch `main`. Fluxo completo testado em produção: login Steam, biblioteca, conquistas, geração de guia por IA com vídeo — tudo funcionando fora do ambiente local pela primeira vez.

---
## 06/09/2026 a 09/09/2026 — Rebranding, i18n, segurança, UX (sessão longa/múltiplos dias)

**Rebranding para Platinai:** nome, logo (wordmark + ícone, versões dark/light), repositório e domínio renomeados (GitHub mantém redirect automático do link antigo). Tema claro/escuro implementado via `data-theme` + CSS custom properties — não via classes Tailwind `dark:`, para permitir troca em runtime sem reconstrução de estilos.

**Bug de race condition (tema e idioma):** o `useEffect` de "salvar preferência no localStorage" podia rodar antes do `useEffect` de "ler preferência salva" terminar, sobrescrevendo a escolha do usuário com o valor padrão logo após redirecionamentos de página completos (ex: o callback de login da Steam). Corrigido com uma flag `loaded` que bloqueia o salvamento até a leitura inicial terminar. Padrão a repetir em qualquer novo Context/Provider que persista estado em localStorage.

**Internacionalização completa (PT-BR/EN):** dicionário de UI (`translations.ts`) + contexto (`language-provider.tsx`). Nome/descrição de conquistas: a Steam aceita parâmetro `l=english|portuguese` na própria API — a rota de achievements passou a aceitar `?lang=` e repassar. Guias de IA: Gemini agora gera as duas traduções em uma única chamada, retornando JSON `{pt, en}` — evita dobrar o consumo de cota gerando duas vezes. Coluna `guide_text_en` adicionada; guias antigos (pré-i18n) não têm essa coluna preenchida e caem em fallback para português mesmo no modo EN.

**Segurança (Fase 0 do roadmap, concluída):** criado client `supabaseAdmin` (service role key, nunca exposto ao navegador) separado do client `supabase` (anon, só leitura). RLS de `achievement_guides` restrito: removidas as policies públicas de INSERT/DELETE, mantida só SELECT — escrita/exclusão agora exigem service role. Rate limiting implementado via nova tabela `generation_log` (RLS habilitado, sem policy pública — só service role acessa), limite de 10 gerações de guia por hora por IP, checado no início de `/api/guides/generate` antes de qualquer chamada externa (protege cota gratuita de Tavily/Gemini contra abuso).

**Tratamento de erros da Steam API — aprendizado importante:** a Steam devolve o mesmo formato de erro (`playerstats.success: false`) ora com status HTTP 200 (ex: perfil privado), ora com 400 (ex: "Requested app has no stats", jogo sem sistema de conquistas). Um código que decide com base em `!response.ok` antes de olhar o conteúdo nunca alcança a mensagem de erro nesses casos. Corrigido: a rota agora sempre converte a resposta para JSON primeiro e decide pelo **conteúdo** (`playerstats.success` + texto da mensagem), nunca pelo status HTTP isolado. Isso permitiu diferenciar 3 casos e dar mensagem amigável para cada: jogo sem conquistas, perfil privado, e erro genérico real.

**UX — badge de platinado:** implementado na tela do jogo (`unlockedCount === total`, com `total > 0`), calculado on-the-fly, não pré-armazenado. Replicar isso na biblioteca foi propositalmente adiado para a Fase 3, quando existir uma tabela de progresso por usuário.

**Bug recorrente de copy-paste em edições de código:** duas vezes na mesma sessão, uma classe `className` destinada a um elemento foi colada por engano em outro elemento próximo, quebrando o layout dele. Combinado com o usuário: correções pequenas em arquivos grandes vêm acompanhadas de mais linhas de contexto ao redor, para facilitar revisão visual antes de testar.

**Problema aberto ao final desta sessão — busca de vídeo do YouTube:** duas tentativas de filtro por palavra-chave no título (blacklist + termos positivos) insuficientes contra vídeos de "guia completo de todos os troféus" (6-8h), que enganam o filtro positivo por conterem termos como "achievement guide" sem serem focados na conquista específica. Resolvido na sessão seguinte — ver entrada de 10/09/2026 abaixo.

---
## 10/09/2026 — Filtro de vídeo do YouTube resolvido

**Contexto:** retomando o problema em aberto da sessão anterior (09/09). Sessão de implementação feita em outra conversa (aba de código); esta entrada resume o que foi reportado como concluído.

**Decisão principal: trocar a fonte da busca de vídeo, de Tavily para YouTube Data API v3.**
Motivo: a causa raiz do problema anterior era que Tavily não retorna a **duração** do vídeo nos resultados de busca — sem esse dado, não havia como distinguir um vídeo de 2 minutos focado na conquista de um longplay de 6-8 horas com o mesmo vocabulário no título ("achievement", "guide", "trophy"). A YouTube Data API v3 devolve duração via `contentDetails.duration` (formato ISO 8601), resolvendo isso diretamente.

**Nova lógica em `searchYoutubeVideo`:**
1. `search.list` busca candidatos
2. `videos.list` busca duração de todos de uma vez
3. Mantém blacklist de termos + regex de "Part N"/"Parte N" da tentativa anterior
4. **Novo:** descarta vídeos fora da faixa 30 segundos – 20 minutos (constantes ajustáveis)
5. Prioriza título que contenha o nome literal da conquista
6. Sem match exato, usa o vídeo mais curto entre os candidatos restantes

**Nova variável de ambiente:** `YOUTUBE_API_KEY` (Google Cloud Console → ativar YouTube Data API v3 → chave simples, sem OAuth). Precisa estar tanto no `.env.local` quanto no painel do Vercel — mesmo tipo de armadilha já visto antes com `SUPABASE_SERVICE_ROLE_KEY`.

**Custo:** ~101 unidades de cota por geração de vídeo (100 do `search.list` + ~1 do `videos.list`), dentro do limite gratuito de 10.000/dia da YouTube Data API — folga grande considerando o rate limit próprio do projeto (10 gerações/hora/IP).

**Resultado:** testado e funcionando no caso que falhava antes (Witcher 3) — vídeo retornado passou a ser focado na conquista específica.

**Pendências registradas para o futuro:**
- Testado só com Witcher 3 até agora; validar com mais jogos antes de considerar robusto
- `MAX_DURATION_SECONDS = 20min` é um valor inicial, pode precisar de ajuste fino (ex: 12-15min)
- Sem fallback automático caso a YouTube Data API falhe/zere cota — hoje retorna guia sem vídeo nesse caso, comportamento aceitável mas não redundante

---
## 17/09/2026 — Fase 2 fechada, Fase 3 (UX da biblioteca), roadmap reordenado

**Fase 2 fechada nesta sessão:** mini player embutido do YouTube (toggle complementar ao link externo, iframe 16:9), fallback honesto para conteúdo insuficiente, botão de regenerar dica restaurado, qualidade da IA validada em 5 jogos de gêneros bem diferentes.

**Bug real e sutil do fallback honesto:** o `gemini.ts` foi ajustado pra devolver um campo `sufficient` (o próprio Gemini se autoavalia), mas a rota `generate/route.ts` continuou desestruturando só `{ pt, en }` — o campo nunca era lido, então toda resposta (mesmo quando o Gemini escrevia literalmente "não há conteúdo suficiente") era salva no cache e exibida como dica normal. Corrigido lendo `{ pt, en, sufficient }` e agindo sobre o campo. Lição: ao adicionar um campo novo a uma função, sempre confirmar que todo call-site que desestrutura o retorno foi atualizado — o TypeScript não pega isso porque desestruturação parcial é válida.

**Rate limit trava o próprio dev:** rodando localmente sem proxy, `x-forwarded-for` cai em `"unknown"` pra todo mundo, e o limite de 10/hora acertava o próprio desenvolvedor testando vários jogos em sequência. Corrigido restringindo o rate limit a `NODE_ENV === "production"`.

**Reordenação do roadmap:** decisão de priorizar um open beta rápido testável só com login Steam (sem conta própria). Nova ordem: Fase 3 (UX da biblioteca + rate limit por usuário) → Fase 4 (responsividade) → Fase 5 (PWA/TWA) → Fase 6 (estrutural: users/user_games, hall da platina, perfil) → Fase 7 (monetização/Stripe) → Fase 8 (polimento visual) → Fase 9 (app desktop). Fases 3 e 6 antes pareciam a mesma coisa, mas foram separadas: Fase 3 é só o mínimo pro rate limit funcionar por pessoa; Fase 6 é o perfil/progresso completo, que só compensa depois de tração real.

**Fase 3 — header fixo, navegação e ordenação da biblioteca:**
- Header da biblioteca replicado no mesmo padrão sticky da tela de conquistas, com logo clicável que rola pro topo.
- Bug de CSS real encontrado: o `GameCover.tsx` tem uma imagem interna com `z-10` pra ficar por cima do fundo desfocado do próprio card. O `div` pai era só `position: relative` sem `z-index` próprio, então não cria um novo contexto de empilhamento — o `z-10` interno escapava e competia diretamente com o `z-10` do header da página. Como os cards vêm depois no HTML, ganhavam o empate. Corrigido adicionando `isolate` no wrapper do card; o header também subiu para `z-30` como segunda camada de segurança.
- Ordenação adicionada (Padrão / A-Z / Z-A) junto da busca já existente.
- Estado da biblioteca (busca, ordenação, modo grid/lista) e posição de scroll agora persistidos em `sessionStorage`, restaurados ao montar. "Voltar à biblioteca" trocado de `<Link href="/">` (navegação nova, sempre topo) pra `router.push("/", {scroll: false})`.
- **Bug não resolvido, registrado como pendência não bloqueante:** a restauração de scroll ainda falha intermitentemente (~1 em cada 5-10 vezes). Tentativas: reforçar por múltiplos frames, `setTimeout`, salvar o scroll explicitamente no `onClick` do link. Nenhuma eliminou o problema. Decisão do usuário: deixar pra depois.

**Rate limit por Steam ID em vez de IP:** coluna `steam_id` adicionada na tabela `generation_log`. A rota de geração pega a sessão no servidor (`getServerSession`) e usa o `steamId` quando disponível. IP mantido como fallback defensivo. Decisão de design: não criar uma tabela `users` separada com "contador" simples (precisaria de lógica própria de reset) — reaproveitar `generation_log` (que já conta por `created_at` numa janela de 1h) é mais simples e correto. Não testado de ponta a ponta em produção ainda.

---
## 26/09/2026 — Fase 4 (responsividade) concluída, Fase 5 (PWA) parte 1 concluída, limite do Gemini identificado

**Fase 4 — Responsividade mobile completa, concluída.** Passada em duas rodadas (biblioteca + conquistas): containers e grids escalando tanto pra mobile pequeno quanto pra desktop grande (indo de `max-w-5xl`/4 colunas até `2xl:max-w-7xl`/6 colunas na biblioteca, e análogo nas conquistas) — resolvendo de uma vez o pedido antigo do usuário de "o grid fica apertado até no PC". Filtros (busca/ordenação/grid-lista) empilham em coluna no mobile em vez de espremer numa linha só.

**Bug real: botão de lista "desaparecendo" no mobile.** O grupo de botões grid/lista, dentro de `overflow-hidden`, estava perdendo espaço pro `<select>` de ordenação (que tinha `flex-1`, crescendo e espremendo o vizinho). O botão não desaparecia de verdade — só ficava sem espaço pra renderizar dentro do container cortado. Corrigido com `flex-shrink-0` no grupo de botões, deixando o `<select>` (menos crítico, texto curto) absorver o aperto.

**Header da tela de conquistas — pedido de branding.** Ideia inicial (ícone do Platinai substituindo o texto "Voltar à biblioteca" no mobile, logo completo no desktop) foi corrigida a pedido do usuário: manter o texto **e** adicionar o ícone ao lado, nos dois tamanhos de tela — um ícone sozinho não é intuitivo o suficiente pra "voltar", mas reforça a marca sempre visível.

**Bug real: ícone minúsculo mesmo com o CSS "certo".** Ao aplicar o ícone, ficou praticamente invisível mesmo numa caixa de 28-32px. Causa raiz: `logo_app.png`/`logo_app_white.png` são telas de 2000×2000px, mas o desenho visível ocupa só uma faixa de ~670×660px centralizada (~33% da área) — o resto é transparência. Confirmado inspecionando o bounding box real via PIL (`Image.getbbox()`). Corrigido gerando versões recortadas (`logo_app_icon.png`/`logo_app_white_icon.png`, com ~8% de margem de respiro) — os originais foram mantidos intactos porque ainda servem como watermark grande na tela de login, onde a margem não importa.

**Fase 5, parte 1 — PWA instalável, concluída e testada.** `manifest.json` (nome, ícones, `theme_color` #e8a94d, `background_color` #000000, `display: standalone`); 3 ícones novos gerados a partir do ícone recortado (fundo preto sólido + glifo branco, incluindo versão "maskable" com mais respiro pra não cortar no mask circular do Android); favicon e apple-touch-icon resolvidos via convenção de arquivo do Next.js (`src/app/icon.png`, `src/app/apple-icon.png`) em vez de tags manuais — isso também fechou o 404 de favicon visto num console de testes anterior. **Testado e confirmado funcionando**: instalável no Chrome desktop e na tela inicial do Android (ícone aparece corretamente, sem fundo estranho, abre em modo standalone).

**Decisão: TWA em vez de Capacitor, por agora.** Discutido as duas rotas pra loja mobile. TWA (Bubblewrap, só Google Play): reaproveita o PWA existente, custo único de $25, menor risco de rejeição. Capacitor (Android+iOS via WebView com acesso a APIs nativas): custo de $25 + $99/ano recorrente da Apple, e risco real de rejeição na App Store por política contra apps "só um site embrulhado sem valor nativo". Escolhido: só TWA/Google Play por agora, mesma lógica de "custo zero até validação" já usada antes. Capacitor/iOS fica pra quando (se) houver tração real.

**Chave de assinatura nunca deve ser gerada numa sessão de IA.** Ao planejar o TWA, decisão explícita de **não** gerar o `keystore` de assinatura do app num ambiente de sandbox temporário, mesmo tendo Java disponível ali — é uma credencial permanente e insubstituível (perder o keystore = nunca mais poder atualizar o app sob a mesma identidade), então precisa nascer na máquina do próprio desenvolvedor, com backup redundante desde o início. Os comandos `keytool` corretos foram passados pro usuário rodar localmente quando quiser, sem custo e sem pressa.

**`assetlinks.json` preparado como template.** Arquivo criado em `public/.well-known/assetlinks.json` com `package_name` decidido (`com.platinai.twa`) e um placeholder no lugar do SHA256 (que só existe depois que o usuário gerar a própria chave). Confirmado que o Next.js serve arquivos dentro de `.well-known/` normalmente via `public/`, sem configuração extra.

**TWA travado, não por código:** falta o usuário gerar a chave local (sem custo, sem pressa) e pagar os $25 (esperando receber). Bubblewrap (geração do projeto Android) não foi iniciado — depende das duas coisas acima, e mesmo assim precisaria rodar localmente (o Bubblewrap baixa SDK/JDK de servidores do Google, fora do alcance de rede do ambiente de sandbox usado nessa sessão).

**Bug de ambiente: `ENOSPC` corrompendo `node_modules` silenciosamente.** Depois de várias clonagens/instalações acumuladas na sessão, o disco do sandbox ficou sem espaço no meio de um `npm install`, e o build seguinte falhou com `Bus error` — um erro sem relação aparente com falta de espaço. Resolvido limpando clones antigos e reinstalando `node_modules` do zero. Lição: um erro de build sem sentido nenhum, depois de um aviso de `ENOSPC`, provavelmente é instalação corrompida, não bug de código — vale limpar e reinstalar antes de investigar mais.

**Limite de taxa gratuito do Gemini identificado como causa provável dos erros 503.** Usuário reportou erros intermitentes `503 UNAVAILABLE` ("high demand") ao gerar dicas em produção. Confirmado no Google AI Studio (Limite de taxa da API → nível gratuito) que o modelo `gemini-3.6-flash` está "próximo do limite" de RPM (requisições por minuto). Ou seja: pelo menos parte desses erros não é sobrecarga temporária do servidor do Google, é o próprio projeto batendo no teto do tier grátis.

**Retry automático — EM ANDAMENTO, NÃO FINALIZADO NESTA SESSÃO.** Como mitigação, começou a implementação de uma retentativa automática (com pequeno delay) em `generateAchievementGuide` (`src/lib/gemini.ts`) pra tentar de novo antes de mostrar erro pro usuário, cobrindo picos temporários. A edição foi só iniciada (localização do `fetch` identificada) — **nenhum código de retry foi escrito, testado ou commitado ainda.** Retomar isso é o primeiro item da próxima sessão.

---
## 14/10/2026 — Estabilidade da geração de dicas: retry, fallback Groq, regenerar seguro, busca em inglês

**Contexto:** erros 503/429 do Gemini (tier grátis perto do limite de RPM) apareciam crus para o usuário, e o vídeo de algumas conquistas não era encontrado. Sessão de implementação em outra conversa; o autor só tinha navegador, então tudo foi entregue como patches aplicados no GitHub Codespaces.

1. **Retry automático do Gemini, só para 503/429** (1 tentativa, 2s de espera). Motivo: cobre picos curtos, mas não cria cota — cada retentativa conta como mais uma requisição no RPM. O erro ganhou o status HTTP (`GeminiError`) e a rota devolve o código estável `ai_busy` (503), traduzido no frontend, em vez de vazar o JSON cru da API.
2. **Fallback de IA com o Groq** (`GROQ_API_KEY`, API compatível com OpenAI). Se o Gemini falhar, a rota tenta o Groq com o mesmo prompt; com o Groq configurado o Gemini **não faz retry** (cai direto, mais rápido e sem gastar RPM). O parse do Groq é **estrito**: JSON inválido ou sem `pt`/`en` falha em vez de salvar texto cru no cache (o parse do Gemini continua tolerante, como antes). Confirmado em produção: o Gemini falhou e o Groq gerou a dica.
   **Aprendizado:** o primeiro modelo escolhido (`llama-3.3-70b-versatile`) foi **desativado pelo Groq em 16/08/2026** — a API devolvia 404. A escolha veio de fontes desatualizadas. Novo padrão: `openai/gpt-oss-120b`, que é modelo de raciocínio (envia `reasoning_effort: low` e `max_tokens: 2048`, senão o "pensar" consome o limite e a resposta vem vazia). O modelo é configurável por `GROQ_MODEL`, sem mexer no código. Antes de fixar qualquer modelo, conferir a página de deprecações do provedor.
3. **"Regenerar dica" não apaga mais o guia antes de gerar o novo.** Bug real: o botão apagava o guia salvo e só depois chamava a geração; se o Gemini falhasse, o guia bom era perdido. Agora a rota aceita `force=true`, ignora o cache e só **substitui (UPDATE)** se o novo guia ficar pronto e suficiente. Se a regeneração não achar vídeo novo, mantém o vídeo anterior. Também corrigido: erros não apareciam quando já havia um guia na tela (o erro só era mostrado no ramo "sem guia"); agora aparece dentro do cartão.
4. **Busca de texto e vídeo usa nome e descrição da conquista em inglês** (Steam `GetSchemaForGame`, `l=english`). Causa raiz do caso "Nervos de Aço" (Portal 2) sem vídeo: o frontend manda o nome no idioma da interface e a busca no YouTube/Tavily é em inglês. Se a Steam falhar, usa o nome original. Confirmado: o vídeo passou a aparecer.
5. **Busca de vídeo em 3 níveis de rigor** (estrito; relaxado até 40 min exigindo o nome do jogo no título; último recurso até 45 min) + logs `[youtube]`. A hipótese inicial (filtro rígido demais) não era a causa principal do caso acima, mas fica como rede de segurança.
6. **`.env.example` finalmente commitado.** Ele nunca tinha entrado porque o próprio `.gitignore` (`.env*`) o ignorava; adicionada a exceção `!.env.example`. Nenhuma chave no repositório (verificado por busca de padrões no código e no histórico).

**Lições de fluxo:** com só navegador, o caminho é Codespaces + `git apply` de um `.patch`. No bash, `!` dentro de aspas duplas (ex: `!.env.example` numa mensagem de commit) dispara expansão de histórico e aborta o comando.

---
## 25/11/2026 — Cache de buscas, ping do banco, planos e limites, trava de geração

(Construídos entre 10/11 e 25/11; commits `f00a2f2`, `abc21f0`, `2eaeec9`, `355bb80`.)

1. **Cache de buscas por conquista** (tabela `search_cache`, SQL em `docs/sql/search_cache.sql`). Motivo: os gargalos reais são cotas compartilhadas — Tavily ~1000 créditos/mês (~33 gerações/dia) e YouTube ~101 unidades por busca (~99/dia). Guarda texto do Tavily (inclusive resultado raso, que já ajudou o autor) e vídeo. Validade: texto suficiente 30 dias, texto raso 3 dias (para uma nova tentativa poder achar conteúdo novo), vídeo 30 dias. **Só vídeo encontrado é gravado** (erro de cota não pode virar "sem vídeo" por 30 dias). "Regenerar" (`force`) ignora o cache. Leitura/escrita tolerantes a falha: sem a tabela, o app segue normal.
2. **Ping diário do banco.** O Supabase gratuito pausa o projeto após ~7 dias sem atividade (o autor religava à mão). Rota `/api/cron/keepalive` (leitura mínima em `achievement_guides`, protegida por `CRON_SECRET`) + `vercel.json` com cron 1x/dia (limite do plano Hobby; roda em algum minuto da hora marcada, 08:00 UTC). Preferido a trocar de banco: sem conta nova nem migração. **Confirmado rodando sozinho** (log do Supabase, 26/11 às 08:36).
   **Aprendizado:** os logs de execução do Vercel Hobby duram **1 hora** — servem para testar na hora, não para confirmar uma rotina diária; para isso, usar os logs do Supabase (ou gravar a hora do último ping — pendente).
3. **Planos e limites** (`src/lib/plans.ts`): visitante (só lê), grátis com login Steam (3 gerações por 24h em janela móvel + teto global de 30/24h para todos os grátis) e premium (sem limite diário nem teto global; só trava de segurança de 10/h; único que pode "Regenerar dica"). Premium **temporário** por `PREMIUM_STEAM_IDS` (variável de ambiente, SteamID64 separados por vírgula) até haver campo de plano no banco (Fase 6/Stripe). Valores: 3/dia confirmado pelo autor "por enquanto"; teto de 30 confirmado. Premium sem teto global por escolha do autor (consome a mesma cota compartilhada — risco aceito enquanto só o autor é premium).
   Decisões de implementação: o guia salvo é devolvido **antes** de login e limites (senão quem esgotou as 3 não conseguiria nem ler dicas salvas); a sessão expõe `isPremium` só para a interface (a rota revalida no servidor); limites só em produção; contagem falha = deixa passar e loga `[limits]`; a geração só entra em `generation_log` no fim, então falha do Gemini/Groq não conta; as mensagens de limite não citam o número.
4. **Uma geração por vez por usuário.** Pedido do autor, que também fecha a brecha de cliques simultâneos passarem do limite (a contagem só acontece no fim). Tabela `generation_locks` (PK `steam_id`; SQL em `docs/sql/generation_locks.sql`); o INSERT do segundo falha por chave única → 409 `already_generating`. Precisa ser no banco porque o Vercel roda várias instâncias (lock em memória não enxergaria as outras). Liberada sempre num `finally`; trava velha (>60s, função que morreu) é tomada. Na tela, os botões de gerar ficam desabilitados enquanto uma geração está em andamento.
5. **Verificado por teste de rota com serviços simulados** (fetch simulado de Supabase/Tavily/YouTube/Gemini/Groq/Steam) em cada entrega: cenários de cada tipo de usuário, cada limite, cada caminho de saída que libera a trava, tabela inexistente. Não substitui teste em produção.

---
## 26/11/2026 — Modo visitante (catálogo público da comunidade) e revisão dos documentos

(Commit `533dc72`.)

1. **Modo visitante.** Quem não está logado vê, na tela inicial, o catálogo de jogos com dicas geradas pela comunidade (pesquisa, ordenação A-Z/Z-A, capas, contagem de dicas) e botão "Entrar com Steam" no canto superior direito. Logado, a biblioteca continua igual, com um link "Explorar dicas da comunidade" que abre o mesmo catálogo em `/comunidade`, **separado** da biblioteca (para não misturar com os jogos que ele possui). `/comunidade/[appid]` lista todas as conquistas com raridade; as com dica mostram texto e vídeo, as demais ficam travadas pedindo login. Por ora mostra todas as dicas; a ideia futura é liberar só 5 ou 10 por jogo.
2. **Rotas públicas** `/api/community/games` e `/api/community/games/[appid]`: o catálogo sai de `achievement_guides` (sem tabela nova); a de jogo usa os endpoints públicos da Steam para nome/descrição/raridade e **só responde para jogos que já têm dica** (a chave da Steam não pode virar proxy aberto). Paginação de 1000 em 1000 (o Supabase corta consultas em 1000 linhas; `supabase-js` manda `.range()` como `offset`/`limit` na URL). `Cache-Control` de CDN curto (120s/300s) **somente em respostas de sucesso**, para um erro não ficar preso no cache — o autor notou que o catálogo demora um pouco para atualizar, e aceitou.
3. **Documentos do repositório estavam desatualizados** (`PROJECT_STATE.md` de 01/09 com o nome antigo; `DECISIONS.md` sem as entradas de 06/09 a 26/09, que só existiam na cópia do Projeto). Esta revisão juntou tudo: `DECISIONS.md` ganhou as entradas que faltavam (copiadas sem alteração) mais as novas; `PROJECT_STATE.md` foi reescrito; foi criado `ROADMAP.md` no repositório. A cópia do Projeto no claude.ai precisa ser substituída à mão pelo autor.
4. **Descoberta de segurança (a corrigir):** `POST /api/guides/delete` não tem autenticação e usa a service role; qualquer pessoa que souber a URL apaga guias. Nenhum código do app a chama mais. Decisão recomendada: remover a rota.
5. **Observação do autor, decisão em aberto:** ao sair da tela no meio de uma geração, a dica "não conclui" na tela. Na prática o servidor continua (consome IA e cotas, grava o guia, conta no limite); só o resultado não aparece, porque a tela foi desmontada, e ao reabrir o jogo o guia salvo aparece se já terminou. Opções: (A) deixar concluir em segundo plano e mostrar "gerando…" ao voltar; (B) botão "Cancelar" que aborta o pedido — o aborto no servidor do Vercel não é garantido e só economiza IA se chegar antes da chamada à IA (as buscas já ficam no cache de qualquer jeito). Recomendação: (A). Aguardando o autor.
