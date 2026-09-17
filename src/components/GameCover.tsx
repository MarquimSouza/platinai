"use client"
import { useState } from "react"

type GameCoverProps = {
  appid: number
  name: string
}

export function GameCover({ appid, name }: GameCoverProps) {
  const [attempt, setAttempt] = useState(0)
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null)
  const [giveUp, setGiveUp] = useState(false)

  const sources = [
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
  ]

  async function handleError() {
    if (attempt < sources.length - 1) {
      setAttempt((prev) => prev + 1)
      return
    }

    if (attempt === sources.length - 1 && !fallbackUrl) {
      try {
        const res = await fetch(`/api/covers/${appid}`)
        const json = await res.json()
        if (json.url) {
          setFallbackUrl(json.url)
        } else {
          setGiveUp(true)
        }
      } catch {
        setGiveUp(true)
      }
    } else {
      setGiveUp(true)
    }
  }

  if (giveUp) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[var(--bg-surface-hover)] p-2">
        <span className="text-xs text-center text-[var(--text-secondary)] line-clamp-3">
          {name}
        </span>
      </div>
    )
  }

  const currentSrc = fallbackUrl ?? sources[attempt]

  return (
    <div className="relative isolate w-full h-full overflow-hidden bg-[var(--bg-surface-hover)]">
      {/* Fundo desfocado, preenche todo o espaço */}
      <img
        src={currentSrc}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover blur-2xl scale-125 opacity-50"
      />
      {/* Imagem nítida, centralizada por cima */}
      <img
        src={currentSrc}
        alt=""
        onError={handleError}
        className="relative z-10 w-full h-full object-contain"
      />
    </div>
  )
}