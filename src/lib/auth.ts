import Steam from "next-auth-steam"
import type { NextAuthOptions } from "next-auth"
import type { NextRequest } from "next/server"
import { isPremium } from "@/lib/plans"

export function getAuthOptions(req: NextRequest): NextAuthOptions {
  return {
    providers: [
      Steam(req, {
        clientSecret: process.env.STEAM_SECRET!,
      }),
    ],
    secret: process.env.NEXTAUTH_SECRET,
    callbacks: {
      async jwt({ token, profile }) {
        if (profile) {
          token.steamId = (profile as any).steamid
        }
        return token
      },
      async session({ session, token }) {
        if (session.user) {
          (session.user as any).steamId = token.steamId
          // só pra UI (esconder/mostrar recursos); a rota de geração revalida no servidor
          ;(session.user as any).isPremium = isPremium(token.steamId as string | undefined)
        }
        return session
      },
    },
  }
}