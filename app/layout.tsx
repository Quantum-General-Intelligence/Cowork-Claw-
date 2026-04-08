import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/theme-provider'
import { AppLayoutWrapper } from '@/components/app-layout-wrapper'
import { SessionProvider } from '@/components/auth/session-provider'
import { JotaiProvider } from '@/components/providers/jotai-provider'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Cowork-Claw | AI Coding Agent Platform',
  description:
    'Orchestrate a team of AI coding agents — Claude, Codex, Copilot, Cursor, Gemini and more — to build, fix, and ship code from your browser.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <JotaiProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <SessionProvider />
            <AppLayoutWrapper>{children}</AppLayoutWrapper>
            <Toaster />
          </ThemeProvider>
        </JotaiProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
