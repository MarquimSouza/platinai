"use client"
import Link from "next/link"
import { signIn, signOut, useSession } from "next-auth/react"
import { useTheme } from "@/app/theme-provider"
import { useLanguage } from "@/app/language-provider"
import { ThemeToggle } from "@/components/ThemeToggle"
import { LanguageToggle } from "@/components/LanguageToggle"

type Props = {
  // layout estreito, igual ao da tela de conquistas
  narrow?: boolean
  // para onde voltar depois do login (ex: a própria página do jogo da comunidade)
  signInCallbackUrl?: string
}

// Cabeçalho das telas da comunidade: logo à esquerda; à direita idioma, tema e a conta.
// Sem login: botão "Entrar com Steam". Logado: nick e botão de sair.
export function CommunityHeader({ narrow = false, signInCallbackUrl }: Props) {
  const { data: session, status } = useSession()
  const { theme } = useTheme()
  const { t } = useLanguage()

  const widthClass = narrow
    ? "max-w-3xl lg:max-w-4xl 2xl:max-w-5xl"
    : "max-w-5xl lg:max-w-6xl 2xl:max-w-7xl"

  return (
    <div className="sticky top-0 z-30 bg-[var(--bg-base)]/95 backdrop-blur border-b border-[var(--border-subtle)]">
      <div className={`${widthClass} mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-2`}>
        <Link href="/" aria-label="Platinai" className="cursor-pointer flex-shrink-0">
          <img
            src={theme === "dark" ? "/logo_black.png" : "/logo_white.png"}
            alt="Platinai"
            className="w-24 sm:w-32 h-auto"
          />
        </Link>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <LanguageToggle />
          <ThemeToggle />
          {status === "authenticated" && (
            <>
              <span className="hidden sm:inline text-sm text-[var(--text-secondary)] max-w-[10rem] truncate">
                {session?.user?.name}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                {t.signOut}
              </button>
            </>
          )}
          {status === "unauthenticated" && (
            <button
              onClick={() => signIn("steam", signInCallbackUrl ? { callbackUrl: signInCallbackUrl } : undefined)}
              className="bg-[#1b2838] hover:bg-[#2a3f5a] transition-colors text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-medium cursor-pointer whitespace-nowrap"
            >
              {t.signIn}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
