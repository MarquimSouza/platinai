import { supabaseAdmin } from "@/lib/supabase"

// "Uma geração por vez por usuário": enquanto uma dica está sendo gerada, outra do mesmo usuário
// é recusada até a primeira terminar. Fecha a brecha de cliques simultâneos passarem do limite,
// já que a geração só entra na contagem (generation_log) no FIM.
//
// Precisa ser no banco (tabela generation_locks, ver docs/sql/generation_locks.sql): o Vercel roda
// várias instâncias, então um bloqueio em memória não enxergaria as outras.
// A chave primária (steam_id) é o que garante a exclusividade: o INSERT do segundo falha.

// Se a função morrer no meio (timeout/queda) a trava não é liberada; depois desse prazo
// ela é considerada velha e pode ser tomada. Maior que a geração mais lenta possível.
const STALE_LOCK_MS = 60_000

// true = pode gerar (trava obtida); false = já existe geração em andamento desse usuário.
// Guarda também qual conquista está sendo gerada (appid/apiname), pra tela mostrar "gerando…"
// se o usuário sair e voltar. Se as colunas ainda não existem (SQL não rodado), grava só o steam_id.
// Se o banco falhar por outro motivo, deixa passar e registra no log.
export async function acquireGenerationLock(
  steamId: string,
  appid?: string,
  apiname?: string
): Promise<boolean> {
  try {
    const staleBefore = new Date(Date.now() - STALE_LOCK_MS).toISOString()
    await supabaseAdmin
      .from("generation_locks")
      .delete()
      .eq("steam_id", steamId)
      .lt("locked_at", staleBefore)

    let { error } = await supabaseAdmin
      .from("generation_locks")
      .insert({ steam_id: steamId, appid: appid ?? null, apiname: apiname ?? null })

    // coluna inexistente (PGRST204 / 42703): tenta de novo só com o steam_id
    if (error && (error.code === "PGRST204" || error.code === "42703")) {
      ;({ error } = await supabaseAdmin.from("generation_locks").insert({ steam_id: steamId }))
    }

    if (!error) return true

    if (error.code === "23505") return false // violação de chave única: já tem geração em andamento

    console.warn("[lock] não foi possível obter a trava, liberando mesmo assim:", error.message)
    return true
  } catch (err) {
    console.warn("[lock] erro inesperado ao obter a trava, liberando mesmo assim:", err)
    return true
  }
}

// Qual geração está em andamento para esse usuário (ou null). Trava velha não conta.
export async function getActiveGeneration(
  steamId: string
): Promise<{ appid: string; apiname: string } | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("generation_locks")
      .select("appid, apiname, locked_at")
      .eq("steam_id", steamId)
      .maybeSingle()

    if (error || !data || !data.appid || !data.apiname) return null
    if (Date.now() - new Date(data.locked_at).getTime() > STALE_LOCK_MS) return null
    return { appid: String(data.appid), apiname: String(data.apiname) }
  } catch {
    return null
  }
}

export async function releaseGenerationLock(steamId: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("generation_locks").delete().eq("steam_id", steamId)
    if (error) console.warn("[lock] falha ao liberar a trava:", error.message)
  } catch (err) {
    console.warn("[lock] erro inesperado ao liberar a trava:", err)
  }
}
