import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { getAuthOptions } from "@/lib/auth"
import { supabase, supabaseAdmin } from "@/lib/supabase"
import { generateAchievementGuide, GeminiError } from "@/lib/gemini"
import { searchAchievementGuide, searchYoutubeVideo } from "@/lib/tavily"
import { getEnglishAchievementInfo } from "@/lib/steam-schema"
import type { NextRequest } from "next/server"

export async function POST(req: NextRequest) {
  const session = await getServerSession(getAuthOptions(req))
  const steamId = (session?.user as any)?.steamId ?? null

  const body = await req.json()
  const { appid, apiname, gameName, achievementName, achievementDescription, force } = body

  if (!appid || !apiname || !gameName || !achievementName) {
    return NextResponse.json({ error: "Dados incompletos" }, { status: 400 })
  }

  const ip = req.headers.get("x-forwarded-for") ?? "unknown"

  // Rate limit só em produção — localmente (npm run dev) não existe proxy repassando
  // o IP real, então todo teste cairia no mesmo balde de "unknown" e travaria o próprio dev.
  if (process.env.NODE_ENV === "production") {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    // Por Steam ID quando logado (mais justo e difícil de burlar); IP como fallback
    // pra requisições sem sessão (não deveria acontecer no fluxo normal, mas é defensivo).
    let query = supabaseAdmin
      .from("generation_log")
      .select("*", { count: "exact", head: true })
      .gte("created_at", oneHourAgo)

    query = steamId ? query.eq("steam_id", steamId) : query.eq("ip", ip)

    const { count } = await query

    if ((count ?? 0) >= 10) {
      return NextResponse.json(
        { error: "Muitas gerações recentes. Tente novamente mais tarde." },
        { status: 429 }
      )
    }
  }

  const { data: existing } = await supabase
    .from("achievement_guides")
    .select("guide_text, guide_text_en, video_url")
    .eq("appid", String(appid))
    .eq("apiname", apiname)
    .maybeSingle()

  // force = "Regenerar dica": ignora o cache, mas o guia antigo só é substituído se o novo der certo
  if (existing && !force) {
    return NextResponse.json({
      guideTextPt: existing.guide_text,
      guideTextEn: existing.guide_text_en,
      videoUrl: existing.video_url,
      cached: true,
    })
  }

  try {
    const description = achievementDescription ?? ""

    // Buscas na web (texto e vídeo) usam o nome/descrição em inglês — o que o usuário vê
    // pode estar em português, mas guias e vídeos quase sempre estão em inglês.
    // Se a Steam não responder, cai pro nome original (comportamento anterior).
    const english = await getEnglishAchievementInfo(appid, apiname)
    const searchName = english?.name ?? achievementName
    const searchDescription = english?.description || description

    const searchQuery = searchDescription
      ? `how to ${searchName}: ${searchDescription} - ${gameName} achievement guide`
      : `how to unlock ${searchName} - ${gameName} achievement guide`

    const videoQuery = `${gameName} ${searchName} achievement`

    const [searchResult, videoUrl] = await Promise.all([
      searchAchievementGuide(searchQuery),
      searchYoutubeVideo(videoQuery, searchName, gameName),
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
      video_url: videoUrl,
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