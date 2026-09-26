import { Providers } from "./providers";
import "./globals.css"
import type { Metadata, Viewport } from "next"

export const metadata: Metadata = {
  title: "Platinai",
  description: "Veja o que falta pra platinar seus jogos da Steam, e como fazer isso.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Platinai",
  },
}

export const viewport: Viewport = {
  themeColor: "#e8a94d",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
