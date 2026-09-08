import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import type { NextRequest } from "next/server"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const appid = searchParams.get("appid")

  if (!appid) {
    return NextResponse.json({ error: "appid é obrigatório" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("achievement_guides")
    .select("apiname, guide_text, guide_text_en, video_url")
    .eq("appid", appid)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const guidesMap: Record <
    string,
    { pt: string; en: string | null; videoUrl: string | null }
  > = {}

  for (const row of data ?? []) {
    guidesMap[row.apiname] = {
      pt: row.guide_text,
      en: row.guide_text_en,
      videoUrl: row.video_url,
    }
  }

  return NextResponse.json(guidesMap)
}