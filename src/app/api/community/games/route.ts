import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

// Catálogo público da comunidade: jogos que têm pelo menos uma dica salva, com a quantidade de dicas.
// Sai direto de achievement_guides (leitura pública já permitida pelo RLS) — sem tabela nova.
// Só guias suficientes ficam salvos, então a contagem é de dicas de verdade.

const PAGE_SIZE = 1000 // limite de linhas por consulta do Supabase
const MAX_PAGES = 20 // trava de segurança (20 mil dicas)

export async function GET() {
  const byApp = new Map<string, { name: string; guides: number }>()

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE
    const { data, error } = await supabase
      .from("achievement_guides")
      .select("appid, game_name")
      .order("appid")
      .order("apiname") // ordem estável entre páginas
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    for (const row of data ?? []) {
      const key = String(row.appid)
      const entry = byApp.get(key)
      if (entry) {
        entry.guides += 1
        if (!entry.name && row.game_name) entry.name = row.game_name
      } else {
        byApp.set(key, { name: row.game_name ?? "", guides: 1 })
      }
    }

    if ((data?.length ?? 0) < PAGE_SIZE) break
  }

  const games = [...byApp.entries()]
    .map(([appid, v]) => ({ appid: Number(appid), name: v.name || `App ${appid}`, guides: v.guides }))
    .filter((g) => Number.isFinite(g.appid))

  // Cache curto no CDN (só em respostas de sucesso): alivia o banco e a visita ao catálogo é leitura
  return NextResponse.json({ games }, {
    headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
  })
}
