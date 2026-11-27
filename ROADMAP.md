# Roadmap — Platinai

> Checklist de implementação. Marque `[x]` conforme concluir. Atualize `PROJECT_STATE.md` junto.
> Última atualização: 26/11/2026.

---

## 🔴 Fase 0 — CONCLUÍDA ✅
- [x] Segurança (Service Role Key, RLS restrito, rate limiting)
- [x] README + rebranding completo para Platinai

## 🟢 Fase 1 — CONCLUÍDA ✅
- [x] Busca/filtro de jogos e conquistas
- [x] Ordenação de conquistas desbloqueadas para o final
- [x] Mensagem amigável: sem conquistas / perfil privado
- [x] Header fixo na tela de conquistas
- [x] Badge "🏆 Platinado!" (só na tela do jogo)

## 🟢 Fase 1.5 — Concluída (fora do plano original)
- [x] Tema claro/escuro persistente, sem race condition
- [x] i18n PT-BR/EN completo (interface + Steam API + guias de IA bilíngues)
- [x] Detecção automática de idioma do navegador
- [x] Cursores de clicável em todos os botões

## 🟢 Fase 2 — Médias — CONCLUÍDA ✅ (16/09/2026)
- [x] Filtro de vídeo do YouTube, mini player embutido
- [x] Fallback honesto para conteúdo insuficiente
- [x] Botão "Regenerar dica"
- [x] Qualidade da IA validada em jogos variados
- [x] Grid/lista com toggle, light/dark mode
- [x] Rate limit só ativo em produção

## 🟢 Fase 3 — UX da biblioteca e navegação — CONCLUÍDA ✅ (17/09/2026)
- [x] Header fixo na biblioteca com logo clicável
- [x] Ordenação Padrão / A-Z / Z-A
- [x] Preservar estado + scroll ao voltar (bug intermitente conhecido, não bloqueante)
- [x] Rate limit por Steam ID (reaproveitando `generation_log`, coluna `steam_id`)

## 🟢 Fase 4 — Responsividade — CONCLUÍDA ✅ (26/09/2026)
- [x] Responsividade mobile completa; grid/lista sem perder botão; containers escalando em telas grandes
- [x] Header da tela de conquistas com ícone do Platinai + "Voltar à biblioteca"

## 🟢 Fase 4.5 — Estabilidade, planos e modo visitante — CONCLUÍDA ✅ (14/10 a 26/11/2026)
*(fora do plano original; antecipada antes de lançar na Play Store e de comprar domínio)*
- [x] Retry automático do Gemini (503/429) + mensagem de erro amigável traduzida
- [x] Fallback de IA com Groq (padrão `openai/gpt-oss-120b`, configurável por `GROQ_MODEL`) — confirmado em produção
- [x] "Regenerar dica" que não perde o guia antigo se a regeneração falhar; erros visíveis dentro do cartão
- [x] Busca de vídeo/guia pelo nome da conquista em inglês (corrigiu "Nervos de Aço", Portal 2); vídeo em 3 níveis de rigor + logs
- [x] `.env.example` commitado (com exceção no `.gitignore`)
- [x] Cache de buscas (`search_cache`): texto Tavily + vídeo YouTube, validade 30d / 3d raso
- [x] Ping diário do Supabase (Vercel Cron + `CRON_SECRET`) — confirmado rodando sozinho
- [x] Planos: visitante / grátis (3 por 24h, teto global 30) / premium (por `PREMIUM_STEAM_IDS`); regenerar só premium
- [x] Uma geração por vez por usuário (trava `generation_locks`)
- [x] Modo visitante: catálogo público na tela inicial, `/comunidade` para logado, página do jogo somente leitura, rotas públicas `/api/community/*`
- [x] Documentos do repositório atualizados (`PROJECT_STATE`, `DECISIONS`, `ROADMAP`)

## 🔧 Próximos itens (ordem sugerida)
- [ ] **Remover `/api/guides/delete`** — sem autenticação, usa a service role, e nenhum código do app a usa mais *(segurança, prioridade máxima, pequeno)*
- [ ] **Decidir** o comportamento ao sair da tela durante uma geração: (A) concluir em segundo plano + indicador "gerando…" ao voltar *(recomendado)* ou (B) botão "Cancelar" com aborto do pedido
- [ ] Ping do banco gravando a hora do último ping numa tabela (prova durável; autor já aprovou, depois de testar o modo visitante)
- [ ] Investigar o limite real do Gemini (Google AI Studio → Limite de taxa da API: RPM, cota diária ou tokens?)
- [ ] Busca de reserva para o Tavily (Exa preferida; exige o autor criar a conta e conferir limites atuais)
- [ ] Teste ponta a ponta real do plano grátis (esvaziar `PREMIUM_STEAM_IDS` no Vercel + Redeploy): 3 por dia, teto global, botão de regenerar escondido
- [ ] Conferir em uso: retorno do login para `/comunidade/[appid]` e o visual do cabeçalho/cartões do catálogo no celular
- [ ] Futuro: no modo visitante, liberar só 5 ou 10 dicas por jogo e travar o resto pedindo login
- [ ] Mais provedores de IA no futuro (autor quer aumentar a folga de cota)

## 🟡 Fase 5 — PWA / TWA — PARCIALMENTE CONCLUÍDA — **TWA adiado (stand by por decisão do autor)**
- [x] **PWA instalável** — manifest, ícones (192/512/maskable), favicon + apple-touch-icon pela convenção do Next.js. Testado no Chrome desktop e na tela inicial do Android
- [x] Template do `assetlinks.json` preparado (`public/.well-known/assetlinks.json`), com placeholder de SHA256
- [ ] **TWA / Google Play** — travado em decisões externas ao código: gerar chave de assinatura **local** (`keytool`; nunca numa sessão de IA) + pagar $25 (único). Depois: Bubblewrap, SHA256 real no `assetlinks.json`, envio à Play Console
- [ ] *(decisão tomada, não uma tarefa)* Capacitor/iOS fica para depois de haver tração real ($99/ano e risco de rejeição)
- [ ] **Domínio próprio** — adiado; ao comprar: atualizar `NEXTAUTH_URL`, DNS/domínio no Vercel, e revisar `assetlinks.json`/manifest

## 🟠 Fase 6 — Estrutural (perfil e progresso do usuário)
- [ ] Tabelas `users` (inclui o **plano** de cada usuário, substituindo `PREMIUM_STEAM_IDS`) e `user_games`
- [ ] Hall da platina
- [ ] Badge de platinado também na biblioteca
- [ ] Botão de sync manual
- [ ] Perfil de usuário

## 🟠 Fase 7 — Monetização
- [ ] Integração com Stripe (o plano premium hoje é manual)
- [ ] Definir plano gratuito vs. pago (limites atuais em `src/lib/plans.ts`)

## 🔵 Fase 8 — Polimento visual
- [ ] Revisão de UI/UX geral, identidade visual mais refinada

## 🔵 Fase 9 — App desktop
- [ ] App desktop com overlay (Electron/Tauri)

---

## Pendências e lembretes

- ⚠️ Scroll da biblioteca intermitente ao voltar das conquistas — não bloqueante
- ⚠️ Limites do plano grátis testados só em simulação (ver "Próximos itens")
- ⚠️ O catálogo da comunidade pode levar alguns minutos para refletir uma dica nova (cache de CDN de 120s/300s, só em sucesso) — aceito pelo autor
- ✅ Rate limit por Steam ID, perfil privado, filtro de vídeo e qualidade da IA validados antes; ping do banco validado em 26/11

## Notas técnicas

- A Steam varia o status HTTP (200 ou 400) para o mesmo tipo de erro — sempre ler o corpo da resposta antes de decidir
- Ao adicionar um campo no retorno de uma função, confirmar todo call-site que desestrutura o retorno — TypeScript não avisa
- `z-index` só fica contido com `isolate`; `flex-1` pode espremer um vizinho (use `flex-shrink-0`); PNG com margem transparente → checar `getbbox()` antes de usar como ícone
- `ENOSPC` durante instalação pode corromper `node_modules` — limpar e reinstalar antes de investigar
- Keystore de app nunca gerado numa sessão de IA — só localmente, com backup redundante
- Limites de geração só em produção; contados por Steam ID em janela móvel de 24h (`generation_log`)
- Modelo de IA gratuito pode ser desativado sem aviso (Groq desativou o `llama-3.3-70b-versatile` em 16/08/2026): manter em variável de ambiente e conferir as deprecações do provedor
- Supabase grátis pausa por inatividade e corta consultas em 1000 linhas; Vercel Hobby guarda logs 1 hora e roda cron no máximo 1x/dia
- Variável de ambiente nova: colocar no Vercel **e** fazer Redeploy
- Mensagem de commit no bash: nunca `!` dentro de aspas duplas
- Cotas compartilhadas gratuitas (Tavily ~33 gerações/dia, YouTube ~99/dia, Gemini/Groq) são o gargalo real — daí limites, cache de buscas e teto global

## Ordem estratégica (decisão de 16/09/2026, ainda em vigor, com a Fase 4.5 antecipada)

Prioridade é um **open beta** testável sem exigir conta própria:
1. UX/navegação + responsividade (Fases 3-4) ✅
2. Estabilidade, planos e modo visitante (Fase 4.5) ✅ — antecipado antes de Play Store e domínio
3. PWA ✅; TWA/Play Store e domínio ficam para depois (stand by)
4. Estrutural completo (Fase 6) só depois de ter tração real
5. Monetização (Fase 7) só depois de existir algo que valha pagar
6. Polimento visual (Fase 8) por último de propósito
7. App desktop (Fase 9) — maior custo técnico, menor urgência

---

*Última atualização: 26/11/2026 — Fase 4.5 concluída (estabilidade da IA, cache de buscas, ping do banco, planos e limites, trava de geração, modo visitante). Próximo: remover `/api/guides/delete` e decidir o comportamento ao sair da tela durante uma geração.*
