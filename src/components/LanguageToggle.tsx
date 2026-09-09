"use client"
import { useLanguage } from "@/app/language-provider"

export function LanguageToggle() {
  const { language, toggleLanguage } = useLanguage()

  return (
    <button
      onClick={toggleLanguage}
            className="w-10 h-10 flex items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] transition-colors text-xs font-bold cursor-pointer"
      >
      {language === "pt" ? "EN" : "PT"}
    </button>
  )
}