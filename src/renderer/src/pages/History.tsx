import { useCallback, useEffect, useState } from 'react'
import type { HistoryItem, Snapshot } from '../../../shared/types'

function fmtDate(ms: number): string {
  if (!ms) return ''
  return new Date(ms).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function fmtLength(ms: number): string {
  if (!ms) return ''
  const min = Math.round(ms / 60000)
  return `${min} min`
}

function MatchCard({ m }: { m: HistoryItem }): JSX.Element {
  const result = m.won === null ? 'draw' : m.won ? 'win' : 'loss'
  const resultText = m.won === null ? 'EMPATE' : m.won ? 'VICTORIA' : 'DERROTA'
  const kd = m.deaths > 0 ? (m.kills / m.deaths).toFixed(2) : m.kills.toFixed(2)

  return (
    <div className={`match-card ${result}`}>
      <div className="match-result-bar" />
      {m.agentIcon && <img className="match-agent" src={m.agentIcon} alt={m.agentName ?? ''} />}
      <div className="match-main">
        <div className="match-top">
          <span className={`match-result-text ${result}`}>{resultText}</span>
          <span className="match-queue">{m.queue}</span>
          <span className="match-map">{m.mapName}</span>
        </div>
        <div className="match-sub">
          {fmtDate(m.startedAt)} · {fmtLength(m.lengthMs)}
        </div>
      </div>
      <div className="match-score">
        {m.queue === 'Combate a muerte' ? (
          <span className="rounds">{m.kills} kills</span>
        ) : (
          <span className="rounds">
            {m.roundsWon}<span className="rounds-sep">:</span>{m.roundsLost}
          </span>
        )}
      </div>
      <div className="match-kda">
        <div className="kda-line">
          {m.kills} / {m.deaths} / {m.assists}
        </div>
        <div className="kda-sub">KD {kd}</div>
      </div>
      <div className="match-rr">
        {m.rrDelta !== null && (
          <span className={m.rrDelta >= 0 ? 'rr-up' : 'rr-down'}>
            {m.rrDelta >= 0 ? '+' : ''}
            {m.rrDelta} RR
          </span>
        )}
      </div>
    </div>
  )
}

export function HistoryPage({ snapshot }: { snapshot: Snapshot }): JSX.Element {
  const [items, setItems] = useState<HistoryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const r = await window.valtrack.getHistory()
    if (Array.isArray(r)) setItems(r)
    else setError(r.error)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (snapshot.state !== 'offline' && items === null && !loading) void load()
  }, [snapshot.state, items, loading, load])

  if (snapshot.state === 'offline') {
    return (
      <div className="empty-state">
        <h2>Historial no disponible</h2>
        <p>Abre VALORANT para consultar tus últimas partidas.</p>
      </div>
    )
  }

  return (
    <div className="history-page">
      <div className="page-header">
        <h2>Últimas partidas</h2>
        <button className="btn" onClick={() => void load()} disabled={loading}>
          {loading ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>

      {error && <div className="error-banner">⚠ {error}</div>}
      {loading && items === null && <div className="loading">Cargando historial…</div>}
      {items && items.length === 0 && !loading && (
        <div className="loading">No se encontraron partidas recientes.</div>
      )}
      {items && (
        <div className="match-list">
          {items.map((m) => (
            <MatchCard key={m.matchId} m={m} />
          ))}
        </div>
      )}
    </div>
  )
}
