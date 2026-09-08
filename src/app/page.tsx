"use client"
import { signIn, signOut, useSession } from "next-auth/react"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useTheme } from "./theme-provider"
import { useLanguage } from "./language-provider"
import { ThemeToggle } from "@/components/ThemeToggle"
import { LanguageToggle } from "@/components/LanguageToggle"
import { GameCover } from "@/components/GameCover"

type Game = {
  appid: number
  name: string
  playtime_forever: number
}

export default function Home() {
  const { data: session } = useSession()
  const { theme } = useTheme()
  const { t } = useLanguage()
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")

  useEffect(() => {
    if (session) {
      setLoading(true)
      fetch("/api/steam/games")
        .then((res) => res.json())
        .then((data) => setGames(data))
        .finally(() => setLoading(false))
    }
  }, [session])

  const visibleGames = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return games
    return games.filter((g) => g.name.toLowerCase().includes(query))
  }, [games, search])

  if (!session) {
    const wordmark = theme === "dark" ? "/logo_black.png" : "/logo_white.png"
    const watermark = theme === "dark" ? "/logo_app_white.png" : "/logo_app.png"
    const bgClass = theme === "dark" ? "bg-black" : "bg-white"

    return (
      <main
        className={`relative min-h-screen w-full flex flex-col items-center justify-center gap-8 px-6 overflow-hidden ${bgClass}`}
      >
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>

        <img
          src={watermark}
          alt=""
          aria-hidden="true"
          className="absolute w-[800px] h-[800px] object-contain opacity-[0.04] pointer-events-none select-none"
        />

        <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-md">
          <div className="text-center w-full">
            <img
              src={wordmark}
              alt="Platinai"
              className="w-full max-w-[360px] h-auto mx-auto"
            />
            <p className="mt-4 text-base text-[var(--text-secondary)]">{t.tagline}</p>
          </div>
          <button
            onClick={() => signIn("steam")}
            className="bg-[#1b2838] hover:bg-[#2a3f5a] transition-colors text-white px-8 py-4 rounded-lg font-medium text-lg"
          >
            {t.signIn}
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen px-6 py-10 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <div>
          <img
            src={theme === "dark" ? "/logo_black.png" : "/logo_white.png"}
            alt="Platinai"
            className="w-48 h-auto"
          />
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {t.loggedAs(session.user?.name ?? "")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <ThemeToggle />
          <button
            onClick={() => signOut()}
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            {t.signOut}
          </button>
        </div>
      </header>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          {t.library}
        </h2>
        <span className="text-xs text-[var(--text-secondary)] font-mono">
          {visibleGames.length} {t.games}
        </span>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <input
          type="text"
          placeholder={t.searchGame}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--gold)]"
        />
        <div className="flex bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode("grid")}
            className={`px-3 py-2 text-sm ${viewMode === "grid" ? "bg-[var(--bg-surface-hover)] text-[var(--gold)]" : "text-[var(--text-secondary)]"}`}
            aria-label="Grid view"
          >
            ▦
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`px-3 py-2 text-sm ${viewMode === "list" ? "bg-[var(--bg-surface-hover)] text-[var(--gold)]" : "text-[var(--text-secondary)]"}`}
            aria-label="List view"
          >
            ☰
          </button>
        </div>
      </div>

      {loading && <p className="text-[var(--text-secondary)]">{t.loadingGames}</p>}

      {!loading && visibleGames.length === 0 && (
        <p className="text-[var(--text-secondary)] text-sm">{t.noGamesFound(search)}</p>
      )}

      {viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {visibleGames.map((game) => (
            <Link
              key={game.appid}
              href={`/games/${game.appid}`}
              className="group bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] transition-colors rounded-lg overflow-hidden border border-[var(--border-subtle)] flex flex-col"
            >
              <div className="aspect-[2/3] bg-[var(--bg-base)] overflow-hidden">
                <GameCover appid={game.appid} name={game.name} />
              </div>
              <div className="p-2.5">
                <p className="text-sm font-medium line-clamp-2">{game.name}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibleGames.map((game) => (
            <li key={game.appid}>
              <Link
                href={`/games/${game.appid}`}
                className="flex items-center justify-between bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] transition-colors rounded-lg px-4 py-3 border border-[var(--border-subtle)]"
              >
                <span className="font-medium">{game.name}</span>
                <span className="text-[var(--text-secondary)]">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}