import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { getAuthOptions } from "@/lib/auth"
import { supabase, supabaseAdmin } from "@/lib/supabase"
import { generateAchievementGuide, GeminiError } from "@/lib/gemini"
import { searchAchievementGuide, searchYoutubeVideo } from "@/lib/tavily"
import { getEnglishAchievementInfo } from "@/lib/steam-schema"
import { getSearchCache, saveTextCache, saveVideoCache } from "@/lib/search-cache"
import { isPremium, getPremiumSteamIds, FREE_DAILY_LIMIT, FREE_GLOBAL_DAILY_CAP, PREMIUM_HOURLY_SAFETY_LIMIT } from "@/lib/plans"
import type { NextRequest } from "next/server"

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

// Devolve a resposta de erro se algum limite foi atingido, ou null se pode gerar.
// Se a contagem falhar (erro no banco), deixa passar (fail-open) e registra no log.
async function checkGenerationLimits(steamId: string, premium: boolean): Promise<NextResponse | null> {
  const since = (ms: number) => new Date(Date.now() - ms).toISOString()

  if (premium) {
    // Premium: sem limite diário nem teto global, só uma trava de segurança por hora
    const { count, error } = await supabaseAdmin
      .from("generation_log")
      .select("*", { count: "exact", head: true })
      .eq("steam_id", steamId)
      .gte("created_at", since(HOUR_MS))
    if (error) console.warn("[limits] contagem premium falhou:", error.message)

    if ((count ?? 0) >= PREMIUM_HOURLY_SAFETY_LIMIT) {
      return NextResponse.json(
        { error: "Muitas gerações recentes. Tente novamente mais tarde.", code: "rate_limited" },
        { status: 429 }
      )
    }
    return null
  }

  // Grátis: limite por pessoa nas últimas 24h
  const { count: userCount, error: userErr } = await supabaseAdmin
    .from("generation_log")
    .select("*", { count: "exact", head: true })
    .eq("steam_id", steamId)
    .gte("created_at", since(DAY_MS))
  if (userErr) console.warn("[limits] contagem do usuário falhou:", userErr.message)

  if ((userCount ?? 0) >= FREE_DAILY_LIMIT) {
    return NextResponse.json({ error: "daily_limit", code: "daily_limit" }, { status: 429 })
  }

  // Grátis: teto global da comunidade nas últimas 24h (gerações de premium não entram na conta)
  let globalQuery = supabaseAdmin
    .from("generation_log")
    .select("*", { count: "exact", head: true })
    .gte("created_at", since(DAY_MS))
  const premiumIds = getPremiumSteamIds()
  if (premiumIds.length > 0) {
    globalQuery = globalQuery.not("steam_id", "in", `(${premiumIds.join(",")})`)
  }
  const { count: globalCount, error: globalErr } = await globalQuery
  if (globalErr) console.warn("[limits] contagem global falhou:", globalErr.message)

  if ((globalCount ?? 0) >= FREE_GLOBAL_DAILY_CAP) {
    return NextResponse.json({ error: "global_cap", code: "global_cap" }, { status: 429 })
  }

  return null
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(getAuthOptions(req))
  const steamId = (session?.user as any)?.steamId ?? null

  const body = await req.json()
  const { appid, apiname, gameName, achievementName, achievementDescription, force } = body

  if (!appid || !apiname || !gameName || !achievementName) {
    return NextResponse.json({ error: "Dados incompletos" }, { status: 400 })
  }

  const ip = req.headers.get("x-forwarded-for") ?? "unknown"

  const { data: existing } = await supabase
    .from("achievement_guides")
    .select("guide_text, guide_text_en, video_url")
    .eq("appid", String(appid))
    .eq("apiname", apiname)
    .maybeSingle()

  // Guia já salvo: devolve pra qualquer pessoa (inclusive sem login) — é conteúdo público
  // e não gasta cota nem conta no limite. Por isso vem ANTES do login e dos limites.
  // force = "Regenerar dica": ignora o guia salvo, mas ele só é substituído se o novo der certo.
  if (existing && !force) {
    return NextResponse.json({
      guideTextPt: existing.guide_text,
      guideTextEn: existing.guide_text_en,
      videoUrl: existing.video_url,
      cached: true,
    })
  }

  // A partir daqui é geração nova (gasta IA e cotas de busca): exige login com a Steam
  if (!steamId) {
    return NextResponse.json({ error: "login_required", code: "login_required" }, { status: 401 })
  }

  const premium = isPremium(steamId)

  // "Regenerar dica" é recurso do premium
  if (force && !premium) {
    return NextResponse.json({ error: "premium_only", code: "premium_only" }, { status: 403 })
  }

  // Limites só em produção — localmente (npm run dev) não existe proxy repassando
  // o IP real nem histórico de uso, e travaria o próprio dev testando.
  if (process.env.NODE_ENV === "production") {
    const limited = await checkGenerationLimits(String(steamId), premium)
    if (limited) return limited
  }

  try {
    const description = achievementDescription ?? ""

    // Cache de buscas: reaproveita texto/vídeo já buscados (poupa Tavily e YouTube).
    // "Regenerar dica" (force) ignora o cache de propósito, pra tentar achar conteúdo melhor.
    const cached = force ? null : await getSearchCache(appid, apiname)
    const needText = !cached?.text
    const needVideo = !cached?.videoUrl

    // Buscas na web (texto e vídeo) usam o nome/descrição em inglês — o que o usuário vê
    // pode estar em português, mas guias e vídeos quase sempre estão em inglês.
    // Se a Steam não responder, cai pro nome original (comportamento anterior).
    // Só consulta a Steam se alguma busca for mesmo acontecer.
    let searchName = achievementName
    let searchDescription = description
    if (needText || needVideo) {
      const english = await getEnglishAchievementInfo(appid, apiname)
      searchName = english?.name ?? achievementName
      searchDescription = english?.description || description
    }

    const searchQuery = searchDescription
      ? `how to ${searchName}: ${searchDescription} - ${gameName} achievement guide`
      : `how to unlock ${searchName} - ${gameName} achievement guide`

    const videoQuery = `${gameName} ${searchName} achievement`

    const [searchResult, videoUrl] = await Promise.all([
      cached?.text ??
        searchAchievementGuide(searchQuery).then(async (r) => {
          await saveTextCache(appid, apiname, r) // guarda inclusive resultado raso (validade curta)
          return r
        }),
      cached?.videoUrl ??
        searchYoutubeVideo(videoQuery, searchName, gameName).then(async (v) => {
          if (v) await saveVideoCache(appid, apiname, v) // só salva vídeo achado, nunca "não achou"
          return v
        }),
    ])

    if (!searchResult.hasEnoughContent) {
      // Conta a busca no rate limit (Tavily/YouTube já foram consultados),
      // mas NÃO salva no Supabase — assim o usuário pode tentar de novo depois,
      // sem depender do botão de regenerar (que não existe mais).
      await supabaseAdmin.from("generation_log").insert({ ip, steam_id: steamId })

      return NextResponse.json({
        guideTextPt:
          "Não encontramos conteúdo suficiente na web para gerar uma dica confiável para esta conquista ainda. Tente novamente mais tarde — pode surgir conteúdo novo.",
        guideTextEn:
          "We couldn't find enough web content to generate a reliable hint for this achievement yet. Try again later — new content may show up.",
        videoUrl,
        cached: false,
        insufficientContent: true,
      })
    }

    const { pt, en, sufficient } = await generateAchievementGuide({
      gameName,
      achievementName,
      achievementDescription: description,
      searchContext: searchResult.text,
    })

    // Mesmo com texto suficiente em tamanho (filtro do Tavily acima), o próprio Gemini pode achar
    // o conteúdo genérico/insuficiente para dar passos práticos — trata igual ao caso "sem conteúdo".
    if (!sufficient) {
      await supabaseAdmin.from("generation_log").insert({ ip, steam_id: steamId })

      return NextResponse.json({
        guideTextPt: pt,
        guideTextEn: en,
        videoUrl,
        cached: false,
        insufficientContent: true,
      })
    }

    const guideRow = {
      game_name: gameName,
      achievement_name: achievementName,
      guide_text: pt,
      guide_text_en: en,
      // se a busca nova não achou vídeo, mantém o que o guia já tinha (não apaga por falha de busca)
      video_url: videoUrl ?? existing?.video_url ?? null,
    }

    if (existing) {
      // Regeneração: UPDATE do guia existente (só chega aqui com o novo guia pronto e suficiente)
      const { error: updateError } = await supabaseAdmin
        .from("achievement_guides")
        .update(guideRow)
        .eq("appid", String(appid))
        .eq("apiname", apiname)
      if (updateError) console.error("[guides] falha ao atualizar guia:", updateError.message)
    } else {
      await supabaseAdmin
        .from("achievement_guides")
        .insert({ appid: String(appid), apiname, ...guideRow })
    }

    await supabaseAdmin.from("generation_log").insert({ ip, steam_id: steamId })

    return NextResponse.json({ guideTextPt: pt, guideTextEn: en, videoUrl, cached: false })
  } catch (err: any) {
    // IA sobrecarregada/no limite: código estável pro frontend traduzir, sem vazar o JSON cru da API
    if (err instanceof GeminiError && err.isBusy) {
      console.error(err.message)
      return NextResponse.json({ error: "ai_busy", code: "ai_busy" }, { status: 503 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}