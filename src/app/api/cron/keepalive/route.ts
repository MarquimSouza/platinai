import { NextRequest, NextResponse } from "next/server"
import { supabase, supabaseAdmin } from "@/lib/supabase"

// O plano gratuito do Supabase pausa o projeto após ~7 dias sem atividade.
// O Vercel Cron (ver vercel.json) chama esta rota 1x por dia e ela faz uma leitura mínima no banco.
// Plano Hobby do Vercel: no máximo 1 execução por dia, em horário dentro da hora marcada (suficiente aqui).
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  // A rota é pública na internet: só o Vercel Cron pode acionar, via CRON_SECRET.
  // O Vercel envia "Authorization: Bearer <CRON_SECRET>" automaticamente quando a variável existe.
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  // Cliente anon (só leitura): leitura pública de achievement_guides já é permitida pelo RLS
  const { error } = await supabase.from("achievement_guides").select("appid").limit(1)

  if (error) {
    console.error("[keepalive] falha ao consultar o banco:", error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // Registra a hora do ping (prova durável: os logs do Vercel Hobby duram só 1 hora) e mantém
  // só os últimos 30 dias. Falha aqui NÃO derruba o ping: a leitura acima já contou como atividade.
  let logged = false
  try {
    const { error: insertError } = await supabaseAdmin.from("keepalive_log").insert({})
    if (insertError) {
      console.warn("[keepalive] não foi possível registrar a hora do ping:", insertError.message)
    } else {
      logged = true
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      await supabaseAdmin.from("keepalive_log").delete().lt("pinged_at", cutoff)
    }
  } catch (err) {
    console.warn("[keepalive] erro inesperado ao registrar o ping:", err)
  }

  return NextResponse.json({ ok: true, logged, at: new Date().toISOString() })
}
