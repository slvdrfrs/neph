import type { Metadata } from 'next'
import { Inter, Instrument_Serif } from 'next/font/google'
import Link from 'next/link'
import Image from 'next/image'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const serif = Instrument_Serif({
  weight: '400',
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-serif'
})

export const metadata: Metadata = {
  title: 'NEPH.GG — Tracker de VALORANT',
  description:
    'Rangos en vivo, historial ilimitado y perfiles públicos de VALORANT. No afiliado a Riot Games.'
}

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}): JSX.Element {
  return (
    <html lang="es" className={`${inter.variable} ${serif.variable}`}>
      <body>
        <div className="bg-glow" aria-hidden="true" />

        <header className="site-header">
          <Link href="/" className="brand">
            <Image src="/logo.png" alt="" width={30} height={30} />
            <span className="brand-name">
              NEPH<span className="brand-gg">.GG</span>
            </span>
          </Link>
          <nav className="site-nav">
            <Link href="/#features">Características</Link>
            <Link href="/#app">La app</Link>
            <a
              href="https://github.com/slvdrfrs/neph"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </nav>
        </header>

        <main className="site-main">{children}</main>

        <footer className="site-footer">
          <span>
            NEPH.GG no está afiliado a Riot Games. VALORANT es una marca de Riot Games, Inc.
          </span>
          <span className="footer-dim">
            Datos de jugadores vía HenrikDev API · Iconos de valorant-api.com
          </span>
        </footer>
      </body>
    </html>
  )
}
