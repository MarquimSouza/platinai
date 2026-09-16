import { NextResponse } from "next/server"
import { supabase, supabaseAdmin } from "@/lib/supabase"
import { generateAchievementGuide } from "@/lib/gemini"
import { searchAchievementGuide, searchYoutubeVideo } from "@/lib/tavily"
import type { NextRequest } from "next/server"

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { appid, apiname, gameName, achievementName, achievementDescription } = body

  if (!appid || !apiname || !gameName || !achievementName) {
    return NextResponse.json({ error: "Dados incompletos" }, { status: 400 })
  }

  const ip = req.headers.get("x-forwarded-for") ?? "unknown"

  // Rate limit só em produção — localmente (npm run dev) não existe proxy repassando
  // o IP real, então todo teste cairia no mesmo balde de "unknown" e travaria o próprio dev.
  if (process.env.NODE_ENV === "production") {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { count } = await supabaseAdmin
      .from("generation_log")
      .select("*", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", oneHourAgo)

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

  if (existing) {
    return NextResponse.json({
      guideTextPt: existing.guide_text,
      guideTextEn: existing.guide_text_en,
      videoUrl: existing.video_url,
      cached: true,
    })
  }

  try {
    const description = achievementDescription ?? ""

    const searchQuery = description
      ? `how to ${achievementName}: ${description} - ${gameName} achievement guide`
      : `how to unlock ${achievementName} - ${gameName} achievement guide`

    const videoQuery = `${gameName} ${achievementName} achievement`

    const [searchResult, videoUrl] = await Promise.all([
      searchAchievementGuide(searchQuery),
      searchYoutubeVideo(videoQuery, achievementName),
    ])

    if (!searchResult.hasEnoughContent) {
      // Conta a busca no rate limit (Tavily/YouTube já foram consultados),
      // mas NÃO salva no Supabase — assim o usuário pode tentar de novo depois,
      // sem depender do botão de regenerar (que não existe mais).
      await supabaseAdmin.from("generation_log").insert({ ip })

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
      await supabaseAdmin.from("generation_log").insert({ ip })

      return NextResponse.json({
        guideTextPt: pt,
        guideTextEn: en,
        videoUrl,
        cached: false,
        insufficientContent: true,
      })
    }

    await supabaseAdmin.from("achievement_guides").insert({
      appid: String(appid),
      apiname,
      game_name: gameName,
      achievement_name: achievementName,
      guide_text: pt,
      guide_text_en: en,
      video_url: videoUrl,
    })

    await supabaseAdmin.from("generation_log").insert({ ip })

    return NextResponse.json({ guideTextPt: pt, guideTextEn: en, videoUrl, cached: false })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}