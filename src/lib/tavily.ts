export async function searchAchievementGuide(query: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: 4,
      include_answer: false,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Erro na API do Tavily: ${errBody}`)
  }

  const data = await res.json()

  const combined = (data.results ?? [])
    .map((r: any) => `Fonte: ${r.url}\n${r.content}`)
    .join("\n\n---\n\n")

  return combined || "Nenhum resultado encontrado."
}

function parseISO8601Duration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0
  const hours = parseInt(match[1] ?? "0", 10)
  const minutes = parseInt(match[2] ?? "0", 10)
  const seconds = parseInt(match[3] ?? "0", 10)
  return hours * 3600 + minutes * 60 + seconds
}

export async function searchYoutubeVideo(
  query: string,
  achievementName?: string
): Promise<string | null> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return null

  const blacklist = [
    "trailer", "announcement", "reveal", "cinematic", "teaser",
    "walkthrough", "let's play", "lets play", "full playthrough",
    "no commentary", "100%", "complete edition",
  ]
  const partPattern = /\b(part|parte|ep|episode|episódio)\s*\d+/i

  // 1. Busca candidatos
  const searchRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=8` +
      `&q=${encodeURIComponent(query + " achievement guide")}&key=${apiKey}`
  )
  if (!searchRes.ok) return null
  const searchData = await searchRes.json()
  const videoIds = (searchData.items ?? []).map((i: any) => i.id?.videoId).filter(Boolean)
  if (videoIds.length === 0) return null

  // 2. Pega duração (custa só 1 unidade, mesmo com vários ids de uma vez)
  const detailsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet` +
      `&id=${videoIds.join(",")}&key=${apiKey}`
  )
  if (!detailsRes.ok) return null
  const detailsData = await detailsRes.json()

  const MAX_DURATION_SECONDS = 20 * 60 // ajustável — ver nota abaixo
  const MIN_DURATION_SECONDS = 30 // descarta shorts/lixo

  const candidates = (detailsData.items ?? [])
    .map((d: any) => ({
      id: d.id,
      title: (d.snippet?.title ?? "").toLowerCase(),
      durationSec: parseISO8601Duration(d.contentDetails?.duration ?? "PT0S"),
    }))
    .filter((c: any) => {
      if (partPattern.test(c.title)) return false
      if (blacklist.some((term) => c.title.includes(term))) return false
      if (c.durationSec > MAX_DURATION_SECONDS) return false
      if (c.durationSec < MIN_DURATION_SECONDS) return false
      return true
    })

  // Prioriza título com o nome literal da conquista
  if (achievementName) {
    const nameLower = achievementName.toLowerCase()
    const exactMatch = candidates.find((c: any) => c.title.includes(nameLower))
    if (exactMatch) return `https://www.youtube.com/watch?v=${exactMatch.id}`
  }

  // Senão, o mais curto entre os que sobraram — geralmente o mais focado
  const shortest = [...candidates].sort((a: any, b: any) => a.durationSec - b.durationSec)[0]
  return shortest ? `https://www.youtube.com/watch?v=${shortest.id}` : null
}