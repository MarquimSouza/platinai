export type RarityKey = "common" | "uncommon" | "rare" | "epic" | "legendary" | "unknown"

export type RarityTier = {
  key: RarityKey
  color: string
}

export function getRarityTier(globalPercent: number | null): RarityTier {
  if (globalPercent === null) {
    return { key: "unknown", color: "var(--text-secondary)" }
  }
  if (globalPercent < 1) {
    return { key: "legendary", color: "var(--rarity-legendary)" }
  }
  if (globalPercent < 5) {
    return { key: "epic", color: "var(--rarity-epic)" }
  }
  if (globalPercent < 15) {
    return { key: "rare", color: "var(--rarity-rare)" }
  }
  if (globalPercent < 40) {
    return { key: "uncommon", color: "var(--rarity-uncommon)" }
  }
  return { key: "common", color: "var(--rarity-common)" }
}