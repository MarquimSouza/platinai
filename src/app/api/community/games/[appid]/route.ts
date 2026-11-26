import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import type { NextRequest } from "next/server"

// Conquistas de um jogo da comunidade, sem precisar de login: nome/descrição e raridade vêm da
// Steam (endpoints públicos); as dicas vêm do banco. Não tem estado "desbloqueada" (não há usuário).
// Só responde para jogos que já têm dica salva — assim a chave da Steam não vira um proxy aberto.

type SchemaAchievement = { name: string; displayName?: string; description?: string }

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appid: string }> }
) {
  const { appid } = await params
  if (!/^\d+$/.test(appid)) {
    return NextResponse.json({ error: "appid inválido" }, { status: 400 })
  }

  const lang = new URL(req.url).searchParams.get("lang") === "en" ? "english" : "portuguese"

  const { data: rows, error } = await supabase
    .from("achievement_guides")
    .select("apiname, achievement_name, game_name, guide_text, guide_text_en, video_url")
    .eq("appid", appid)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "not_in_community" }, { status: 404 })
  }

  const guides = new Map(
    rows.map((r) => [
      r.apiname as string,
      { pt: r.guide_text as string, en: (r.guide_text_en as string | null) ?? null, videoUrl: (r.video_url as string | null) ?? null },
    ])
  )

  const apiKey = process.env.STEAM_SECRET
  const [schemaRes, globalRes] = await Promise.all([
    apiKey
      ? fetch(
          `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${apiKey}&appid=${appid}&l=${lang}`
        ).catch(() => null)
      : Promise.resolve(null),
    fetch(
      `https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${appid}&format=json`
    ).catch(() => null),
  ])

  let schemaList: SchemaAchievement[] = []
  try {
    if (schemaRes?.ok) {
      const data = await schemaRes.json()
      schemaList = data?.game?.availableGameStats?.achievements ?? []
    }
  } catch {}

  const percentMap = new Map<string, number>()
  try {
    if (globalRes?.ok) {
      const data = await globalRes.json()
      for (const p of data?.achievementpercentages?.achievements ?? []) {
        percentMap.set(p.name, parseFloat(String(p.percent)))
      }
    }
  } catch {}

  // Se a Steam não respondeu (ou o jogo não tem schema), mostra ao menos as conquistas com dica
  const base: SchemaAchievement[] =
    schemaList.length > 0
      ? schemaList
      : rows.map((r) => ({ name: r.apiname as string, displayName: (r.achievement_name as string) ?? r.apiname }))

  const achievements = base
    .map((a) => ({
      apiname: a.name,
      name: a.displayName || a.name,
      description: a.description ?? "",
      globalPercent: percentMap.get(a.name) ?? null,
      guide: guides.get(a.name) ?? null,
    }))
    .sort((a, b) => {
      if (a.globalPercent === null) return 1
      if (b.globalPercent === null) return -1
      return a.globalPercent - b.globalPercent // mais raras primeiro, como na tela do usuário
    })

  return NextResponse.json(
    {
      appid: Number(appid),
      gameName: (rows[0].game_name as string) || `App ${appid}`,
      total: achievements.length,
      withGuides: achievements.filter((a) => a.guide).length,
      achievements,
    },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } }
  )
}
