import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { getAuthOptions } from "@/lib/auth"
import { getActiveGeneration } from "@/lib/generation-lock"
import type { NextRequest } from "next/server"

// "Tem uma dica sendo gerada pra mim neste jogo?" — usado pela página do jogo quando o usuário
// sai no meio de uma geração e volta: o servidor continua gerando e a tela mostra "gerando…"
// até terminar. Só responde sobre o próprio usuário logado.
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const session = await getServerSession(getAuthOptions(req))
  const steamId = (session?.user as any)?.steamId as string | undefined
  if (!steamId) {
    return NextResponse.json({ generating: null }, { status: 401 })
  }

  const appid = new URL(req.url).searchParams.get("appid")
  const active = await getActiveGeneration(steamId)

  // só interessa se a geração em andamento é deste jogo
  const generating = active && appid && active.appid === appid ? active.apiname : null
  return NextResponse.json({ generating })
}
