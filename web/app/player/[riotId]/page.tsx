import type { Metadata } from 'next'
import Link from 'next/link'
import { getPlayerProfile } from '@/lib/henrik'
import type { RankChip } from '@/lib/types'

interface Props {
  params: { riotId: string }
}

/** "Six-Kari" → { name: "Six", tag: "Kari" } (el tag es lo que va tras el último guion) */
function parseRiotId(riotId: string): { name: string; tag: string } | null {
  const decoded = decodeURIComponent(riotId)
  const dash = decoded.lastIndexOf('-')
  if (dash <= 0 || dash === decoded.length - 1) return null
  return { name: decoded.slice(0, dash), tag: decoded.slice(dash + 1) }
}

export function generateMetadata({ params }: Props): Metadata {
  const id = parseRiotId(params.riotId)
  return {
    title: id ? `${id.name}#${id.tag} — NEPH.GG` : 'Jugador — NEPH.GG'
  }
}

function Chip({ rank }: { rank: RankChip }): JSX.Element {
  return (
    <span className="rank-chip">
      <span className="rank-dot" style={{ background: `var(--rank-${rank.group})` }} />
      {rank.name}
      {rank.rr > 0 && <span className="rank-rr">{rank.rr} RR</span>}
    </span>
  )
}

export default async function PlayerPage({ params }: Props): Promise<JSX.Element> {
  const id = parseRiotId(params.riotId)
  const profile = id ? await getPlayerProfile(id.name, id.tag) : null

  if (!profile) {
    return (
      <div className="not-found">
        <h1>Jugador no encontrado</h1>
        <p>Revisa el Riot ID (Nombre#TAG) e inténtalo de nuevo.</p>
        <Link className="btn" href="/">
          Volver al inicio
        </Link>
      </div>
    )
  }

  return (
    <div className="profile-page">
      {profile.demo && (
        <div className="demo-banner">
          Datos de demostración — configura HENRIK_API_KEY en el servidor para ver
          datos reales.
        </div>
      )}

      <div className="profile-hero">
        <div className="profile-id">
          <h1>
            {profile.name}
            <span className="profile-tag">#{profile.tag}</span>
          </h1>
          <div className="profile-meta">
            <span>{profile.region}</span>
            {profile.level != null && <span>Nivel {profile.level}</span>}
          </div>
        </div>
        <div className="profile-ranks">
          <div className="rank-block">
            <div className="rank-block-label">Rango actual</div>
            <Chip rank={profile.rank} />
          </div>
          {profile.peak && (
            <div className="rank-block">
              <div className="rank-block-label">Pico</div>
              <Chip rank={profile.peak} />
            </div>
          )}
        </div>
      </div>

      <div className="stat-row">
        {profile.winrate != null && (
          <div className="stat-card">
            <div className={`stat-value ${profile.winrate >= 50 ? 'win' : ''}`}>
              {profile.winrate}%
            </div>
            <div className="stat-label">Winrate</div>
          </div>
        )}
        {profile.kd != null && (
          <div className="stat-card">
            <div className="stat-value">{profile.kd}</div>
            <div className="stat-label">K/D</div>
          </div>
        )}
        <div className="stat-card">
          <div className="stat-value">{profile.matches.length}</div>
          <div className="stat-label">Partidas recientes</div>
        </div>
      </div>

      <h2 className="section-title">Últimas partidas</h2>
      <div className="match-list">
        {profile.matches.map((m) => (
          <div key={m.id} className="match-row">
            <div
              className={`match-bar ${m.won === null ? 'na' : m.won ? 'win' : 'loss'}`}
            />
            <span className="match-map">{m.map}</span>
            <span className="match-mode">{m.mode}</span>
            <span className="match-agent">{m.agent}</span>
            <span className="match-kda">
              {m.kills} / {m.deaths} / {m.assists}
            </span>
            {m.rrDelta !== null && (
              <span className={`match-rr ${m.rrDelta >= 0 ? 'rr-up' : 'rr-down'}`}>
                {m.rrDelta >= 0 ? '+' : ''}
                {m.rrDelta}
              </span>
            )}
            <span className="match-date">{m.startedAt}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
