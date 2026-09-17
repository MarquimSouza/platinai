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

const LIBRARY_STATE_KEY = "platinai:library:state"
const LIBRARY_SCROLL_KEY = "platinai:library:scroll"

export default function Home() {
  const { data: session } = useSession()
  const { theme } = useTheme()
  const { t } = useLanguage()
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [sortBy, setSortBy] = useState<"default" | "alpha" | "alphaDesc">("default")
  const [restoredScroll, setRestoredScroll] = useState(false)

  // Restaura busca/ordenação/modo salvos ao montar (ex: voltar da tela de conquistas)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LIBRARY_STATE_KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        if (saved.search) setSearch(saved.search)
        if (saved.sortBy) setSortBy(saved.sortBy)
        if (saved.viewMode) setViewMode(saved.viewMode)
      }
    } catch {}
  }, [])

  // Salva busca/ordenação/modo a cada mudança
  useEffect(() => {
    try {
      sessionStorage.setItem(LIBRARY_STATE_KEY, JSON.stringify({ search, sortBy, viewMode }))
    } catch {}
  }, [search, sortBy, viewMode])

  // Salva a posição de scroll continuamente (throttle simples via rAF)
  useEffect(() => {
    let ticking = false
    function handleScroll() {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        try {
          sessionStorage.setItem(LIBRARY_SCROLL_KEY, String(window.scrollY))
        } catch {}
        ticking = false
      })
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

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
    const filtered = query ? games.filter((g) => g.name.toLowerCase().includes(query)) : games
    if (sortBy === "alpha") {
      return [...filtered].sort((a, b) => a.name.localeCompare(b.name))
    }
    if (sortBy === "alphaDesc") {
      return [...filtered].sort((a, b) => b.name.localeCompare(a.name))
    }
    return filtered
  }, [games, search, sortBy])

  // Restaura a posição de scroll salva só depois que a lista de jogos já renderizou
  // (senão a altura da página ainda muda e a posição fica errada)
  useEffect(() => {
    if (restoredScroll || loading || games.length === 0) return
    try {
      const saved = sessionStorage.getItem(LIBRARY_SCROLL_KEY)
      if (saved) {
        requestAnimationFrame(() => {
          window.scrollTo(0, parseInt(saved, 10))
        })
      }
    } catch {}
    setRestoredScroll(true)
  }, [restoredScroll, loading, games])

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
            className="bg-[#1b2838] hover:bg-[#2a3f5a] transition-colors text-white px-8 py-4 rounded-lg font-medium text-lg cursor-pointer"
            >
            {t.signIn}
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen">
      <div className="sticky top-0 z-30 bg-[var(--bg-base)]/95 backdrop-blur border-b border-[var(--border-subtle)]">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="cursor-pointer"
            aria-label={t.library}
          >
            <img
              src={theme === "dark" ? "/logo_black.png" : "/logo_white.png"}
              alt="Platinai"
              className="w-32 h-auto"
            />
          </button>
          <div className="flex items-center gap-3">
            <LanguageToggle />
            <ThemeToggle />
            <button
              onClick={() => signOut()}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
              {t.signOut}
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-10 max-w-5xl mx-auto">
      <p className="text-sm text-[var(--text-secondary)] mt-1 mb-6">
        {t.loggedAs(session.user?.name ?? "")}
      </p>

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
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "default" | "alpha" | "alphaDesc")}
          className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm cursor-pointer focus:outline-none focus:border-[var(--gold)]"
        >
          <option value="default">{t.sortDefault}</option>
          <option value="alpha">{t.sortAlpha}</option>
          <option value="alphaDesc">{t.sortAlphaDesc}</option>
        </select>
        <div className="flex bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg overflow-hidden">
                    <button
            onClick={() => setViewMode("grid")}
            className={`px-3 py-2 text-sm cursor-pointer ${viewMode === "grid" ? "bg-[var(--bg-surface-hover)] text-[var(--gold)]" : "text-[var(--text-secondary)]"}`}
            aria-label="Grid view"
          >
            ▦
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`px-3 py-2 text-sm cursor-pointer ${viewMode === "list" ? "bg-[var(--bg-surface-hover)] text-[var(--gold)]" : "text-[var(--text-secondary)]"}`}
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
              href={`/games/${game.appid}?name=${encodeURIComponent(game.name)}`}
              className="group bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] transition-colors rounded-lg overflow-hidden border border-[var(--border-subtle)] flex flex-col cursor-pointer"
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
                href={`/games/${game.appid}?name=${encodeURIComponent(game.name)}`}
                className="flex items-center justify-between bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] transition-colors rounded-lg px-4 py-3 border border-[var(--border-subtle)] cursor-pointer"
                >
                <span className="font-medium">{game.name}</span>
                <span className="text-[var(--text-secondary)]">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      </div>
    </main>
  )
}