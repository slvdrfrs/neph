import { useEffect, useState } from 'react'
import type { CareerData } from '../../../shared/types'

export interface CareerTarget {
  puuid: string
  name: string
  tag: string
}

function fmtDate(ms: number): string {
  if (!ms) return ''
  return new Date(ms).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

export function CareerModal({
  target,
  onClose
}: {
  target: CareerTarget
  onClose: () => void
}): JSX.Element {
  const [data, setData] = useState<CareerData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setData(null)
    setError(null)
    void window.valtrack.getCareer(target.puuid, target.name, target.tag).then((r) => {
      if (!alive) return
      if ('error' in r) setError(r.error)
      else setData(r)
    })
    return () => {
      alive = false
    }
  }, [target.puuid, target.name, target.tag])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            {target.name}
            {target.tag && <span className="self-tag">#{target.tag}</span>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {!data && !error && <div className="loading">Consultando carrera…</div>}
        {error && <div className="error-banner">⚠ {error}</div>}

        {data && (
          <>
            <div className="career-hero">
              <div className="career-rank">
                {data.rank.icon && <img src={data.rank.icon} alt="" />}
                <div>
                  <div className="career-rank-name">{data.rank.name}</div>
                  {data.rank.tier > 0 && (
                    <div className="career-rank-rr">{data.rank.rr} RR</div>
                  )}
                </div>
              </div>
              {data.peak && (
                <div className="career-peak">
                  <span className="ppp-label">Pico</span>
                  {data.peak.icon && <img src={data.peak.icon} alt="" />}
                  <span>{data.peak.name}</span>
                </div>
              )}
            </div>

            <div className="career-stats">
              <div className="career-stat">
                <div
                  className={`career-stat-value ${
                    data.winrate !== null
                      ? data.winrate >= 55
                        ? 'wr-good'
                        : data.winrate <= 45
                          ? 'wr-bad'
                          : ''
                      : ''
                  }`}
                >
                  {data.winrate !== null ? `${data.winrate}%` : '—'}
                </div>
                <div className="career-stat-label">
                  WR{data.wrGames > 0 ? ` (${data.wrGames})` : ''}
                </div>
              </div>
              <div className="career-stat">
                <div className="career-stat-value">{data.kd?.toFixed(2) ?? '—'}</div>
                <div className="career-stat-label">KD</div>
              </div>
              <div className="career-stat">
                <div className="career-stat-value">
                  {data.hsPct !== null ? `${data.hsPct}%` : '—'}
                </div>
                <div className="career-stat-label">HS</div>
              </div>
              <div className="career-stat">
                <div className="career-stat-value">{data.adr ?? '—'}</div>
                <div className="career-stat-label">ADR</div>
              </div>
            </div>

            {data.matches.length > 0 && (
              <>
                <div className="career-section">Últimas partidas</div>
                <div className="career-matches">
                  {data.matches.map((m) => {
                    const result = m.won === null ? 'draw' : m.won ? 'win' : 'loss'
                    return (
                      <div key={m.matchId} className="career-match">
                        <span className={`career-dot ${result}`} />
                        {m.agentIcon && (
                          <img
                            className="career-agent"
                            src={m.agentIcon}
                            alt={m.agentName ?? ''}
                            title={m.agentName ?? ''}
                          />
                        )}
                        <span className="career-map">{m.mapName}</span>
                        <span className="career-kda">
                          {m.kills} / {m.deaths} / {m.assists}
                        </span>
                        {m.rrDelta !== null && (
                          <span className={m.rrDelta >= 0 ? 'rr-up' : 'rr-down'}>
                            {m.rrDelta >= 0 ? '+' : ''}
                            {m.rrDelta}
                          </span>
                        )}
                        <span className="career-date">{fmtDate(m.startedAt)}</span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
