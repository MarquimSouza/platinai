"use client"
import { createContext, useContext, useEffect, useState } from "react"

type Theme = "dark" | "light"

type ThemeContextType = {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  toggleTheme: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark")
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null
    if (saved === "light" || saved === "dark") {
      setTheme(saved)
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
    if (loaded) {
      localStorage.setItem("theme", theme)
    }
  }, [theme, loaded])

  function toggleTheme() {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"))
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}