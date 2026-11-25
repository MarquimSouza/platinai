// Planos e limites de geração de dicas.
//   - visitante (sem login): só lê dicas já geradas, não gera nada
//   - grátis (login Steam): FREE_DAILY_LIMIT gerações a cada 24h + teto global diário da comunidade
//   - premium: sem limite diário nem teto global (só uma trava de segurança por hora, contra bugs)
// Os limites valem só em produção (ver a rota de geração).

export const FREE_DAILY_LIMIT = 3
export const FREE_GLOBAL_DAILY_CAP = 30
export const PREMIUM_HOURLY_SAFETY_LIMIT = 10

// Premium por enquanto = lista de Steam IDs na variável PREMIUM_STEAM_IDS (separados por vírgula).
// Fica fora do código de propósito: trocar quem é premium não exige novo deploy de código.
// Será substituído por um campo "plano" no banco quando vier a Fase 6 (users) e o Stripe.
export function getPremiumSteamIds(): string[] {
  return (process.env.PREMIUM_STEAM_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^\d{17}$/.test(id)) // SteamID64: 17 dígitos (também evita lixo na lista)
}

export function isPremium(steamId: string | null | undefined): boolean {
  if (!steamId) return false
  return getPremiumSteamIds().includes(String(steamId))
}
