"use client"
import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "./theme-provider"
import { LanguageProvider } from "./language-provider"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <SessionProvider>{children}</SessionProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}