import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { getAuthOptions } from "@/lib/auth"
import type { NextRequest } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appid: string }> }
) {
  const session = await getServerSession(getAuthOptions(req))

  if (!session?.user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const steamId = (session.user as any).steamId
  const apiKey = process.env.STEAM_SECRET
  const { appid } = await params

  const { searchParams } = new URL(req.url)
  const lang = searchParams.get("lang") === "en" ? "english" : "portuguese"

  const [playerRes, globalRes] = await Promise.all([
    fetch(
      `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?appid=${appid}&key=${apiKey}&steamid=${steamId}&l=${lang}`
    ),
    fetch(
      `https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${appid}&format=json`
    ),
  ])

  if (!playerRes.ok) {
    const bodyText = await playerRes.text()
    return NextResponse.json(
      { error: "Erro ao buscar conquistas do jogador", debug: bodyText },
      { status: 400 }
    )
  }

  const playerData = await playerRes.json()
  const globalData = await globalRes.json()

  if (!playerData.playerstats?.success) {
    return NextResponse.json(
      {
        error:
          playerData.playerstats?.error ??
          "Este jogo não tem conquistas ou o perfil não é público",
      },
      { status: 400 }
    )
  }

  const achievements = playerData.playerstats.achievements ?? []
  const percentages: { name: string; percent: number }[] =
    globalData.achievementpercentages?.achievements ?? []

  const percentMap = new Map(
    percentages.map((p) => [p.name, parseFloat(String(p.percent))])
  )

  const merged = achievements.map((a: any) => ({
    apiname: a.apiname,
    name: a.name,
    description: a.description,
    unlocked: a.achieved === 1,
    unlockTime: a.unlocktime,
    globalPercent: percentMap.get(a.apiname) ?? null,
  }))

  merged.sort((a: any, b: any) => {
    if (a.globalPercent === null) return 1
    if (b.globalPercent === null) return -1
    return a.globalPercent - b.globalPercent
  })

  return NextResponse.json({
    gameName: playerData.playerstats.gameName,
    total: merged.length,
    unlockedCount: merged.filter((m: any) => m.unlocked).length,
    achievements: merged,
  })
}