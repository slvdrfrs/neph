import { useState } from 'react'
import { useTracker } from './hooks/useTracker'
import { StatusPill } from './components/StatusPill'
import { LivePage } from './pages/Live'
import { HistoryPage } from './pages/History'
import { ProfilePage } from './pages/Profile'
import { SettingsPage } from './pages/Settings'
import logoUrl from './assets/logo.png'

type Tab = 'live' | 'history' | 'profile' | 'settings'

const svgProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
} as const

const ICONS: Record<Tab, JSX.Element> = {
  live: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  ),
  history: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  profile: (
    <svg {...svgProps}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c1.6-3.8 4.7-5.5 7.5-5.5s5.9 1.7 7.5 5.5" />
    </svg>
  ),
  settings: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="8" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'live', label: 'Partida en vivo' },
  { id: 'history', label: 'Historial' },
  { id: 'profile', label: 'Perfil' },
  { id: 'settings', label: 'Acerca de' }
]

export default function App(): JSX.Element {
  const snapshot = useTracker()
  const [tab, setTab] = useState<Tab>('live')
  const self = snapshot.self
  const rrPct = self?.rank ? Math.min(self.rank.rr, 100) : 0

  return (
    <div className="shell">
      {/* Zona de arrastre invisible de la ventana (sin barra visual) */}
      <div className="titlebar" aria-hidden="true" />

      <div className="app">
        <aside className="sidebar">
          <div className="logo">
            <img className="logo-img" src={logoUrl} alt="NEPH.GG" />
            <div className="logo-text">
              NEPH<span className="logo-dot">.GG</span>
            </div>
          </div>

          {self && (
            <div className="profile-panel">
              {self.cardWide && (
                <div
                  className="profile-banner"
                  style={{ backgroundImage: `url(${self.cardWide})` }}
                />
              )}
              <div className="profile-panel-body">
                <div className="profile-panel-name">
                  {self.name}
                  <span className="self-tag">#{self.tag}</span>
                </div>
                {self.level != null && (
                  <div className="profile-panel-level">Nivel {self.level}</div>
                )}
                {self.rank && (
                  <div className="profile-panel-rank">
                    {self.rank.icon && (
                      <img className="profile-panel-rank-icon" src={self.rank.icon} alt="" />
                    )}
                    <div className="profile-panel-rank-info">
                      <div className="ppr-name">{self.rank.name}</div>
                      {self.rank.tier > 0 && (
                        <>
                          <div className="rr-progress">
                            <div
                              className="rr-progress-fill"
                              style={{ width: `${rrPct}%` }}
                            />
                          </div>
                          <div className="ppr-rr">{self.rank.rr} RR</div>
                        </>
                      )}
                    </div>
                  </div>
                )}
                {self.peak && (
                  <div className="profile-panel-peak">
                    <span className="ppp-label">Pico</span>
                    {self.peak.icon && <img src={self.peak.icon} alt="" />}
                    <span className="ppp-name">{self.peak.name}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <nav className="nav">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`nav-item ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                <span className="nav-icon">{ICONS[t.id]}</span>
                {t.label}
              </button>
            ))}
          </nav>

          <div className="sidebar-footer">
            <StatusPill state={snapshot.state} region={snapshot.region} />
            <div className="sidebar-version">NEPH.GG v0.1.0 · no afiliado a Riot</div>
          </div>
        </aside>

        <main className="main-col">
          <div className="main-top" aria-hidden="true" />
          <div className="content">
            {snapshot.error && (
              <div className="error-banner" title={snapshot.error}>
                Error de conexión: {snapshot.error}
              </div>
            )}
            <div className="page" key={tab}>
              {tab === 'live' && <LivePage snapshot={snapshot} />}
              {tab === 'history' && <HistoryPage snapshot={snapshot} />}
              {tab === 'profile' && <ProfilePage snapshot={snapshot} />}
              {tab === 'settings' && <SettingsPage />}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
