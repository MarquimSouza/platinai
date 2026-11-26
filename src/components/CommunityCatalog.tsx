"use client"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { useLanguage } from "@/app/language-provider"
import { GameCover } from "@/components/GameCover"
import { CommunityHeader } from "@/components/CommunityHeader"

type CatalogGame = { appid: number; name: string; guides: number }

// Catálogo público: jogos que já têm dicas geradas pela comunidade.
// É a tela inicial de quem não está logado, e fica disponível (separado da biblioteca) para quem está.
export function CommunityCatalog() {
  const { status } = useSession()
  const { t } = useLanguage()
  const [games, setGames] = useState<CatalogGame[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<"alpha" | "alphaDesc">("alpha")

  useEffect(() => {
    fetch("/api/community/games")
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? "erro")
        setGames(json.games ?? [])
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [])

  const visibleGames = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = query ? games.filter((g) => g.name.toLowerCase().includes(query)) : games
    const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name))
    return sortBy === "alphaDesc" ? sorted.reverse() : sorted
  }, [games, search, sortBy])

  return (
    <main className="min-h-screen">
      <CommunityHeader />

      <div className="px-4 sm:px-6 py-10 max-w-5xl lg:max-w-6xl 2xl:max-w-7xl mx-auto">
        {status === "authenticated" && (
          <Link
            href="/"
            className="inline-block text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-4"
          >
            ← {t.myLibrary}
          </Link>
        )}

        <h1 className="text-2xl font-bold">{t.communityTitle}</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1 mb-6">
          {status === "unauthenticated" ? t.tagline : t.communitySubtitle}
        </p>

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            {t.communityGames}
          </h2>
          <span className="text-xs text-[var(--text-secondary)] font-mono">
            {visibleGames.length} {t.games}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
          <input
            type="text"
            placeholder={t.searchGame}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:flex-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--gold)]"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "alpha" | "alphaDesc")}
            className="sm:flex-none bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm cursor-pointer focus:outline-none focus:border-[var(--gold)]"
          >
            <option value="alpha">{t.sortAlpha}</option>
            <option value="alphaDesc">{t.sortAlphaDesc}</option>
          </select>
        </div>

        {loading && <p className="text-[var(--text-secondary)]">{t.loadingCommunity}</p>}
        {failed && <p className="text-red-400 text-sm">{t.communityLoadError}</p>}

        {!loading && !failed && games.length === 0 && (
          <p className="text-[var(--text-secondary)] text-sm">{t.noCommunityGames}</p>
        )}
        {!loading && !failed && games.length > 0 && visibleGames.length === 0 && (
          <p className="text-[var(--text-secondary)] text-sm">{t.noGamesFound(search)}</p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {visibleGames.map((game) => (
            <Link
              key={game.appid}
              href={`/comunidade/${game.appid}`}
              className="group bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] transition-colors rounded-lg overflow-hidden border border-[var(--border-subtle)] flex flex-col cursor-pointer"
            >
              <div className="aspect-[2/3] bg-[var(--bg-base)] overflow-hidden">
                <GameCover appid={game.appid} name={game.name} />
              </div>
              <div className="p-2.5">
                <p className="text-sm font-medium line-clamp-2">{game.name}</p>
                <p className="text-xs text-[var(--gold)] mt-1">{t.hintsCount(game.guides)}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
