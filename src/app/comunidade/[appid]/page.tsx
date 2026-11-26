"use client"
import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { signIn, useSession } from "next-auth/react"
import { getRarityTier } from "@/lib/rarity"
import { useLanguage } from "@/app/language-provider"
import { CommunityHeader } from "@/components/CommunityHeader"

type Guide = { pt: string; en: string | null; videoUrl: string | null }

type CommunityAchievement = {
  apiname: string
  name: string
  description: string
  globalPercent: number | null
  guide: Guide | null
}

type CommunityGame = {
  appid: number
  gameName: string
  total: number
  withGuides: number
  achievements: CommunityAchievement[]
}

function getYoutubeVideoId(url: string): string {
  try {
    return new URL(url).searchParams.get("v") ?? ""
  } catch {
    return ""
  }
}

// Conquistas de um jogo da comunidade, somente leitura: mostra as dicas que já existem e
// deixa as demais "travadas" (gerar dica exige login e é feito pela biblioteca do usuário).
export default function CommunityGamePage() {
  const params = useParams()
  const appid = params.appid as string
  const { language, t } = useLanguage()
  const { status } = useSession()

  const [data, setData] = useState<CommunityGame | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [failed, setFailed] = useState(false)
  const [search, setSearch] = useState("")
  const [expandedVideo, setExpandedVideo] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setLoading(true)
    setNotFound(false)
    setFailed(false)

    fetch(`/api/community/games/${appid}?lang=${language}`)
      .then(async (res) => {
        const json = await res.json()
        if (res.status === 404) {
          setNotFound(true)
          return
        }
        if (!res.ok) throw new Error(json.error ?? "erro")
        setData(json)
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [appid, language])

  const visibleAchievements = useMemo(() => {
    if (!data) return []
    const query = search.trim().toLowerCase()
    const filtered = query
      ? data.achievements.filter(
          (a) => a.name.toLowerCase().includes(query) || a.description.toLowerCase().includes(query)
        )
      : data.achievements
    // Dicas disponíveis primeiro (mantém a ordem de raridade dentro de cada grupo)
    return [...filtered].sort((a, b) => Number(!!b.guide) - Number(!!a.guide))
  }, [data, search])

  return (
    <main className="min-h-screen">
      <CommunityHeader narrow signInCallbackUrl={`/comunidade/${appid}`} />

      <div className="max-w-3xl lg:max-w-4xl 2xl:max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <Link
          href="/comunidade"
          className="inline-block text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-4"
        >
          ← {t.backToCommunity}
        </Link>

        {loading && <p className="text-[var(--text-secondary)]">{t.loadingAchievements}</p>}
        {notFound && <p className="text-[var(--text-secondary)]">{t.gameNotInCommunity}</p>}
        {failed && <p className="text-red-400 text-sm">{t.communityLoadError}</p>}

        {data && !loading && (
          <>
            <h1 className="text-2xl font-bold">{data.gameName}</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1 mb-6">
              {t.guidesAvailable(data.withGuides, data.total)}
            </p>

            <input
              type="text"
              placeholder={t.searchAchievement}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full mb-6 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--gold)]"
            />

            {visibleAchievements.length === 0 && (
              <p className="text-[var(--text-secondary)] text-sm">{t.noAchievementsFound(search)}</p>
            )}

            <ul className="flex flex-col gap-3">
              {visibleAchievements.map((a) => {
                const rarity = getRarityTier(a.globalPercent)
                const guideText = a.guide && (language === "en" ? a.guide.en ?? a.guide.pt : a.guide.pt)

                return (
                  <li
                    key={a.apiname}
                    className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-4"
                    style={{ borderLeft: `3px solid ${rarity.color}` }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{a.name}</p>
                        {a.description && (
                          <p className="text-sm text-[var(--text-secondary)] mt-0.5">{a.description}</p>
                        )}
                      </div>
                      {a.globalPercent !== null && (
                        <span
                          className="text-xs font-mono whitespace-nowrap px-2 py-1 rounded"
                          style={{ color: rarity.color, backgroundColor: `${rarity.color}1a` }}
                        >
                          {t.rarity[rarity.key]} · {a.globalPercent.toFixed(1)}%
                        </span>
                      )}
                    </div>

                    {a.guide && guideText ? (
                      <div className="mt-3 p-3 bg-[var(--bg-base)] rounded-md text-sm leading-relaxed">
                        💡 <strong>{t.hintLabel}</strong> {guideText}
                        {a.guide.videoUrl && (
                          <div className="mt-2">
                            <div className="flex items-center gap-3">
                              <a
                                href={a.guide.videoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[var(--gold)] hover:underline text-sm inline-flex items-center gap-1"
                              >
                                {t.watchOnYoutube}
                              </a>
                              <button
                                onClick={() =>
                                  setExpandedVideo((prev) => ({ ...prev, [a.apiname]: !prev[a.apiname] }))
                                }
                                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm cursor-pointer"
                              >
                                {expandedVideo[a.apiname] ? t.hidePlayer : t.showPlayer}
                              </button>
                            </div>
                            {expandedVideo[a.apiname] && (
                              <div className="mt-2 aspect-video rounded-md overflow-hidden border border-[var(--border-subtle)]">
                                <iframe
                                  src={`https://www.youtube.com/embed/${getYoutubeVideoId(a.guide.videoUrl)}`}
                                  title={a.name}
                                  className="w-full h-full"
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                  loading="lazy"
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-3 p-3 rounded-md text-sm border border-dashed border-[var(--border-subtle)] text-[var(--text-secondary)]">
                        <p>
                          🔒 {status === "authenticated" ? t.lockedLoggedIn : t.lockedVisitor}
                        </p>
                        {status === "unauthenticated" && (
                          <button
                            onClick={() => signIn("steam", { callbackUrl: `/comunidade/${appid}` })}
                            className="mt-2 text-sm bg-[#1b2838] hover:bg-[#2a3f5a] transition-colors text-white px-3 py-1.5 rounded-md cursor-pointer"
                          >
                            {t.signIn}
                          </button>
                        )}
                        {status === "authenticated" && (
                          <Link
                            href={`/games/${appid}?name=${encodeURIComponent(data.gameName)}`}
                            className="mt-2 inline-block text-[var(--gold)] hover:underline"
                          >
                            {t.openInLibrary}
                          </Link>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </main>
  )
}
