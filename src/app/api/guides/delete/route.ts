import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import type { NextRequest } from "next/server"

export async function POST(req: NextRequest) {
  const { appid, apiname } = await req.json()

  if (!appid || !apiname) {
    return NextResponse.json({ error: "Dados incompletos" }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from("achievement_guides")
    .delete()
    .eq("appid", String(appid))
    .eq("apiname", apiname)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}