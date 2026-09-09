"use client"
import { useTheme } from "@/app/theme-provider"

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      onClick={toggleTheme}
            className="w-10 h-10 flex items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] transition-colors text-lg cursor-pointer"
      aria-label="Alternar tema claro/escuro"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  )
}