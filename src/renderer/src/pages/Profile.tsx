import { useCallback, useEffect, useState } from 'react'
import type { ProfileData, Snapshot } from '../../../shared/types'
import { RankBadge } from '../components/RankBadge'

export function ProfilePage({ snapshot }: { snapshot: Snapshot }): JSX.Element {
  const [data, setData] = useState<ProfileData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const r = await window.valtrack.getProfile()
    if ('error' in r) setError(r.error)
    else setData(r)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (snapshot.state !== 'offline' && data === null && !loading) void load()
  }, [snapshot.state, data, loading, load])

  if (snapshot.state === 'offline') {
    return (
      <div className="empty-state">
        <h2>Perfil no disponible</h2>
        <p>Abre VALORANT para ver tu perfil competitivo.</p>
      </div>
    )
  }

  const wins = data?.updates.filter((u) => u.delta > 0).length ?? 0
  const losses = data?.updates.filter((u) => u.delta < 0).length ?? 0
  const netRR = data?.updates.reduce((acc, u) => acc + u.delta, 0) ?? 0

  return (
    <div className="profile-page">
      <div className="page-header">
        <h2>Perfil competitivo</h2>
        <button className="btn" onClick={() => void load()} disabled={loading}>
          {loading ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>

      {error && <div className="error-banner">⚠ {error}</div>}
      {loading && data === null && <div className="loading">Cargando perfil…</div>}

      {data && (
        <>
          <div className="profile-hero">
            {data.self.rank?.icon && (
              <img className="profile-rank-img" src={data.self.rank.icon} alt="" />
            )}
            <div className="profile-hero-text">
              <div className="profile-name">
                {data.self.name}
                <span className="self-tag">#{data.self.tag}</span>
              </div>
              <div className="profile-rank-name">
                {data.self.rank?.name ?? 'Sin clasificar'}
                {data.self.rank && data.self.rank.tier > 0 && (
                  <span className="profile-rr"> · {data.self.rank.rr} RR</span>
                )}
              </div>
              {data.self.peak && (
                <div className="profile-peak">
                  Rango máximo: <RankBadge rank={data.self.peak} showRR={false} />
                </div>
              )}
            </div>
            <div className="profile-stats">
              <div className="stat">
                <div className="stat-value win">{wins}</div>
                <div className="stat-label">Victorias*</div>
              </div>
              <div className="stat">
                <div className="stat-value loss">{losses}</div>
                <div className="stat-label">Derrotas*</div>
              </div>
              <div className="stat">
                <div className={`stat-value ${netRR >= 0 ? 'win' : 'loss'}`}>
                  {netRR >= 0 ? '+' : ''}
                  {netRR}
                </div>
                <div className="stat-label">RR neto*</div>
              </div>
            </div>
          </div>
          <p className="footnote">* Sobre las últimas {data.updates.length} partidas competitivas.</p>

          <h3 className="section-title">Evolución de RR</h3>
          <div className="rr-list">
            {data.updates.length === 0 && (
              <div className="loading">Sin partidas competitivas recientes.</div>
            )}
            {data.updates.map((u) => (
              <div key={u.matchId} className="rr-row">
                {u.tierIcon && <img className="rr-tier-icon" src={u.tierIcon} alt="" />}
                <span className="rr-map">{u.mapName ?? '—'}</span>
                <span className="rr-date">
                  {u.startedAt
                    ? new Date(u.startedAt).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: 'short'
                      })
                    : ''}
                </span>
                <span className={`rr-delta ${u.delta >= 0 ? 'rr-up' : 'rr-down'}`}>
                  {u.delta >= 0 ? '+' : ''}
                  {u.delta} RR
                </span>
                <span className="rr-after">{u.rrAfter} RR</span>
                <div
                  className="rr-bar"
                  style={{
                    width: `${Math.min(Math.abs(u.delta) * 3, 100)}px`,
                    background: u.delta >= 0 ? 'var(--win)' : 'var(--loss)'
                  }}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
