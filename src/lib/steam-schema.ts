// Nome e descrição de uma conquista em INGLÊS, direto da Steam.
// Motivo: o frontend manda o nome no idioma da interface (ex: "Nervos de Aço"), mas vídeos
// e guias na web estão em inglês — buscar pelo nome traduzido quase nunca acha nada.
// Em qualquer falha devolve null, e quem chama usa o nome original (comportamento anterior).

export type EnglishAchievementInfo = { name: string; description: string }

export async function getEnglishAchievementInfo(
  appid: string | number,
  apiname: string
): Promise<EnglishAchievementInfo | null> {
  const apiKey = process.env.STEAM_SECRET
  if (!apiKey) return null

  try {
    const res = await fetch(
      `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${apiKey}&appid=${appid}&l=english`,
      { signal: AbortSignal.timeout(4000) }
    )
    if (!res.ok) {
      console.warn(`[steam-schema] GetSchemaForGame falhou: ${res.status}`)
      return null
    }

    const data = await res.json()
    const list: any[] = data?.game?.availableGameStats?.achievements ?? []
    const found = list.find((a) => a.name === apiname)
    if (!found?.displayName) return null

    return { name: found.displayName, description: found.description ?? "" }
  } catch (err) {
    console.warn("[steam-schema] erro ao buscar nome em inglês:", err)
    return null
  }
}
