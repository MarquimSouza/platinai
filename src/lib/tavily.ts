export type GuideSearchResult = {
  text: string
  hasEnoughContent: boolean
}

// Valor inicial, ajustável conforme mais testes (mesmo espírito do MAX_DURATION_SECONDS abaixo)
const MIN_CONTENT_LENGTH = 300

export async function searchAchievementGuide(query: string): Promise<GuideSearchResult> {
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
  const results = data.results ?? []

  const combined = results
    .map((r: any) => `Fonte: ${r.url}\n${r.content}`)
    .join("\n\n---\n\n")

  const totalContentLength = results.reduce(
    (sum: number, r: any) => sum + (r.content?.length ?? 0),
    0
  )

  return {
    text: combined || "Nenhum resultado encontrado.",
    hasEnoughContent: results.length > 0 && totalContentLength >= MIN_CONTENT_LENGTH,
  }
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
  achievementName?: string,
  gameName?: string
): Promise<string | null> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return null

  // Termos que descartam o vídeo em qualquer circunstância (não são guia de conquista)
  const hardBlacklist = ["trailer", "announcement", "reveal", "cinematic", "teaser"]
  // Termos que sugerem vídeo longo/genérico — evitados no 1º nível, aceitos como último recurso
  const softBlacklist = [
    "walkthrough", "let's play", "lets play", "full playthrough",
    "no commentary", "100%", "complete edition",
  ]
  const partPattern = /\b(part|parte|ep|episode|episódio)\s*\d+/i

  // 1. Busca candidatos
  const searchRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=8` +
      `&q=${encodeURIComponent(query + " achievement guide")}&key=${apiKey}`
  )
  if (!searchRes.ok) {
    console.warn(`[youtube] search.list falhou: ${searchRes.status}`)
    return null
  }
  const searchData = await searchRes.json()
  const videoIds = (searchData.items ?? []).map((i: any) => i.id?.videoId).filter(Boolean)
  if (videoIds.length === 0) {
    console.warn(`[youtube] nenhum resultado para "${query}"`)
    return null
  }

  // 2. Pega duração (custa só 1 unidade, mesmo com vários ids de uma vez)
  const detailsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet` +
      `&id=${videoIds.join(",")}&key=${apiKey}`
  )
  if (!detailsRes.ok) {
    console.warn(`[youtube] videos.list falhou: ${detailsRes.status}`)
    return null
  }
  const detailsData = await detailsRes.json()

  const all = (detailsData.items ?? []).map((d: any) => ({
    id: d.id as string,
    title: (d.snippet?.title ?? "").toLowerCase() as string,
    durationSec: parseISO8601Duration(d.contentDetails?.duration ?? "PT0S") as number,
  }))

  const MIN_DURATION_SECONDS = 30 // descarta shorts/lixo
  const gameLower = gameName?.toLowerCase()

  // Níveis do mais rigoroso ao mais permissivo. O 1º é o comportamento original;
  // os seguintes só rodam se o anterior não achar nada (antes, nesse caso, voltava sem vídeo).
  // Nos níveis permissivos exige o nome do jogo no título, pra não trazer vídeo de outro jogo.
  const tiers = [
    { name: "estrito", maxSec: 20 * 60, useSoft: true, usePart: true, needGame: false },
    { name: "relaxado", maxSec: 40 * 60, useSoft: false, usePart: true, needGame: true },
    { name: "ultimo-recurso", maxSec: 45 * 60, useSoft: false, usePart: false, needGame: true },
  ]

  for (const tier of tiers) {
    const candidates = all.filter((c: any) => {
      if (hardBlacklist.some((term) => c.title.includes(term))) return false
      if (tier.usePart && partPattern.test(c.title)) return false
      if (tier.useSoft && softBlacklist.some((term) => c.title.includes(term))) return false
      if (c.durationSec > tier.maxSec) return false
      if (c.durationSec < MIN_DURATION_SECONDS) return false
      if (tier.needGame && gameLower && !c.title.includes(gameLower)) return false
      return true
    })

    if (candidates.length === 0) continue

    // Prioriza título com o nome literal da conquista
    let chosen: any
    if (achievementName) {
      const nameLower = achievementName.toLowerCase()
      chosen = candidates.find((c: any) => c.title.includes(nameLower))
    }
    // Senão, o mais curto entre os que sobraram — geralmente o mais focado
    if (!chosen) {
      chosen = [...candidates].sort((a: any, b: any) => a.durationSec - b.durationSec)[0]
    }

    if (tier.name !== "estrito") {
      console.log(`[youtube] vídeo achado só no nível "${tier.name}" para "${query}"`)
    }
    return `https://www.youtube.com/watch?v=${chosen.id}`
  }

  console.warn(
    `[youtube] ${all.length} candidatos, todos descartados para "${query}": ` +
      all.map((c: any) => `${c.title.slice(0, 40)} (${c.durationSec}s)`).join(" | ")
  )
  return null
}
