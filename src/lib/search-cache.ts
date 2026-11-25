import { supabaseAdmin } from "@/lib/supabase"
import type { GuideSearchResult } from "@/lib/tavily"

// Cache das buscas na web por conquista (tabela search_cache, ver docs/sql/search_cache.sql).
// Objetivo: não gastar de novo cota do Tavily (1000 créditos/mês) e do YouTube (10.000 unidades/dia)
// quando o usuário clica em "Tentar de novo" ou outra pessoa pede a mesma conquista.
//
// Tudo aqui é tolerante a falhas: se a tabela não existir ou o banco falhar, o cache simplesmente
// "não acha nada" e a geração segue normalmente com busca nova.

const DAY_MS = 24 * 60 * 60 * 1000
const TEXT_TTL_MS = 30 * DAY_MS // texto com conteúdo suficiente
const SHALLOW_TEXT_TTL_MS = 3 * DAY_MS // texto raso: validade curta, pra uma nova tentativa poder achar conteúdo novo
const VIDEO_TTL_MS = 30 * DAY_MS

export type CachedSearch = {
  text: GuideSearchResult | null
  videoUrl: string | null
}

export async function getSearchCache(appid: string | number, apiname: string): Promise<CachedSearch> {
  const empty: CachedSearch = { text: null, videoUrl: null }

  try {
    const { data, error } = await supabaseAdmin
      .from("search_cache")
      .select("text_content, has_enough_content, text_cached_at, video_url, video_cached_at")
      .eq("appid", String(appid))
      .eq("apiname", apiname)
      .maybeSingle()

    if (error) {
      console.warn("[search-cache] leitura falhou:", error.message)
      return empty
    }
    if (!data) return empty

    const now = Date.now()
    const result: CachedSearch = { text: null, videoUrl: null }

    if (data.text_content && data.text_cached_at) {
      const ttl = data.has_enough_content ? TEXT_TTL_MS : SHALLOW_TEXT_TTL_MS
      if (now - new Date(data.text_cached_at).getTime() < ttl) {
        result.text = { text: data.text_content, hasEnoughContent: !!data.has_enough_content }
      }
    }

    if (data.video_url && data.video_cached_at) {
      if (now - new Date(data.video_cached_at).getTime() < VIDEO_TTL_MS) {
        result.videoUrl = data.video_url
      }
    }

    return result
  } catch (err) {
    console.warn("[search-cache] erro inesperado na leitura:", err)
    return empty
  }
}

// upsert só com as colunas informadas: salvar o texto não apaga o vídeo e vice-versa
export async function saveTextCache(
  appid: string | number,
  apiname: string,
  result: GuideSearchResult
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("search_cache").upsert(
      {
        appid: String(appid),
        apiname,
        text_content: result.text,
        has_enough_content: result.hasEnoughContent,
        text_cached_at: new Date().toISOString(),
      },
      { onConflict: "appid,apiname" }
    )
    if (error) console.warn("[search-cache] gravação do texto falhou:", error.message)
  } catch (err) {
    console.warn("[search-cache] erro inesperado ao gravar texto:", err)
  }
}

export async function saveVideoCache(
  appid: string | number,
  apiname: string,
  videoUrl: string
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("search_cache").upsert(
      {
        appid: String(appid),
        apiname,
        video_url: videoUrl,
        video_cached_at: new Date().toISOString(),
      },
      { onConflict: "appid,apiname" }
    )
    if (error) console.warn("[search-cache] gravação do vídeo falhou:", error.message)
  } catch (err) {
    console.warn("[search-cache] erro inesperado ao gravar vídeo:", err)
  }
}
