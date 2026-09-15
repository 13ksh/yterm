import type { Metadata } from "next"
import { Geist_Mono, Noto_Sans_KR } from "next/font/google"
import { Providers } from "@/components/providers"
import "./globals.css"

const sans = Noto_Sans_KR({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
})

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "댓글나무 — 유튜브 댓글 트리",
  description:
    "유튜브 댓글을 ├─ @닉네임 형태의 트리로 정리하고 복사합니다. @멘션 대댓글도 안으로 묶습니다.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`dark ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
