"use client"
import { createContext, useContext, useEffect, useState } from "react"
import { translations, type Language } from "@/lib/translations"

type LanguageContextType = {
  language: Language
  toggleLanguage: () => void
  t: typeof translations.pt
}

const LanguageContext = createContext<LanguageContextType>({
  language: "pt",
  toggleLanguage: () => {},
  t: translations.pt,
})

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>("pt")
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem("language") as Language | null

    if (saved === "pt" || saved === "en") {
      setLanguage(saved)
    } else {
      // Primeira visita, sem preferência salva: detecta o idioma do navegador/PC
      const browserLang = navigator.language.toLowerCase()
      setLanguage(browserLang.startsWith("pt") ? "pt" : "en")
    }

    setLoaded(true)
  }, [])

  useEffect(() => {
    if (loaded) {
      localStorage.setItem("language", language)
    }
  }, [language, loaded])

  function toggleLanguage() {
    setLanguage((prev) => (prev === "pt" ? "en" : "pt"))
  }

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, t: translations[language] }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}