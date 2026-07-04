import { useCallback, useEffect, useState } from 'react'
import type { HistoryItem, Scoreboard, Snapshot } from '../../../shared/types'

const PAGE_SIZE = 12

type Filter = 'all' | 'comp' | 'other'

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

function ScoreboardView({ sb }: { sb: Scoreboard }): JSX.Element {
  const groups =
    sb.teams.length > 0
      ? sb.teams.map((t) => ({
          team: t,
          players: sb.players.filter((p) => p.teamId === t.teamId)
        }))
      : [{ team: null, players: sb.players }]

  return (
    <div className="scoreboard">
      {groups.map((g, i) => (
        <div key={g.team?.teamId ?? i} className="sb-team">
          {g.team && (
            <div className={`sb-team-head ${g.team.won ? 'win' : 'loss'}`}>
              {g.team.won ? 'Ganadores' : 'Perdedores'} · {g.team.roundsWon} rondas
            </div>
          )}
          <table className="sb-table">
            <thead>
              <tr>
                <th></th>
                <th>Jugador</th>
                <th>Rango</th>
                <th>ACS</th>
                <th>K / D / A</th>
                <th>HS%</th>
                <th>ADR</th>
              </tr>
            </thead>
            <tbody>
              {g.players.map((p) => (
                <tr key={p.puuid} className={p.isSelf ? 'self' : ''}>
                  <td className="sb-agent-cell">
                    {p.agentIcon && (
                      <img
                        className="sb-agent"
                        src={p.agentIcon}
                        alt={p.agentName ?? ''}
                        title={p.agentName ?? ''}
                      />
                    )}
                  </td>
                  <td className="sb-name">
                    {p.name}
                    {p.tag && <span className="player-tag">#{p.tag}</span>}
                  </td>
                  <td>
                    {p.tierIcon && (
                      <img className="sb-tier" src={p.tierIcon} alt="" title={p.tierName ?? ''} />
                    )}
                  </td>
                  <td className="sb-num sb-strong">{p.acs}</td>
                  <td className="sb-num">
                    {p.kills} / {p.deaths} / {p.assists}
                  </td>
                  <td className="sb-num">{p.hsPct !== null ? `${p.hsPct}%` : '—'}</td>
                  <td className="sb-num">{p.adr ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function MatchCard({
  m,
  open,
  board,
  onToggle
}: {
  m: HistoryItem
  open: boolean
  board: Scoreboard | 'loading' | 'error' | undefined
  onToggle: () => void
}): JSX.Element {
  const result = m.won === null ? 'draw' : m.won ? 'win' : 'loss'
  const resultText = m.won === null ? 'EMPATE' : m.won ? 'VICTORIA' : 'DERROTA'
  const kd = m.deaths > 0 ? (m.kills / m.deaths).toFixed(2) : m.kills.toFixed(2)

  return (
    <div className={`match-wrap ${open ? 'open' : ''}`}>
      <div className={`match-card ${result}`} onClick={onToggle}>
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
              {m.roundsWon}
              <span className="rounds-sep">:</span>
              {m.roundsLost}
            </span>
          )}
        </div>
        <div className="match-kda">
          <div className="kda-line">
            {m.kills} / {m.deaths} / {m.assists}
          </div>
          <div className="kda-sub">
            KD {kd}
            {m.hsPct !== null && ` · HS ${m.hsPct}%`}
            {m.adr !== null && ` · ADR ${m.adr}`}
          </div>
        </div>
        <div className="match-rr">
          {m.rrDelta !== null && (
            <span className={m.rrDelta >= 0 ? 'rr-up' : 'rr-down'}>
              {m.rrDelta >= 0 ? '+' : ''}
              {m.rrDelta} RR
            </span>
          )}
        </div>
        <span className={`match-chev ${open ? 'open' : ''}`}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </div>

      {open && (
        <div className="match-expand">
          {board === 'loading' && <div className="loading">Cargando scoreboard…</div>}
          {board === 'error' && (
            <div className="loading">No se pudo cargar el detalle de esta partida.</div>
          )}
          {board && board !== 'loading' && board !== 'error' && <ScoreboardView sb={board} />}
        </div>
      )}
    </div>
  )
}

export function HistoryPage({ snapshot }: { snapshot: Snapshot }): JSX.Element {
  const [items, setItems] = useState<HistoryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reachedEnd, setReachedEnd] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [boards, setBoards] = useState<Record<string, Scoreboard | 'loading' | 'error'>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setReachedEnd(false)
    const r = await window.valtrack.getHistory(0)
    if (Array.isArray(r)) {
      setItems(r)
      if (r.length < PAGE_SIZE) setReachedEnd(true)
    } else {
      setError(r.error)
    }
    setLoading(false)
  }, [])

  const loadMore = useCallback(async () => {
    if (!items || loadingMore) return
    setLoadingMore(true)
    const r = await window.valtrack.getHistory(items.length)
    if (Array.isArray(r)) {
      if (r.length < PAGE_SIZE) setReachedEnd(true)
      setItems((prev) => [...(prev ?? []), ...r])
    } else {
      setError(r.error)
    }
    setLoadingMore(false)
  }, [items, loadingMore])

  const toggle = useCallback(
    (matchId: string) => {
      if (openId === matchId) {
        setOpenId(null)
        return
      }
      setOpenId(matchId)
      if (!boards[matchId]) {
        setBoards((prev) => ({ ...prev, [matchId]: 'loading' }))
        void window.valtrack.getScoreboard(matchId).then((r) => {
          setBoards((prev) => ({
            ...prev,
            [matchId]: 'error' in r ? 'error' : r
          }))
        })
      }
    },
    [openId, boards]
  )

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

  const filtered = (items ?? []).filter((m) => {
    if (filter === 'all') return true
    const isComp = m.queue === 'Competitivo'
    return filter === 'comp' ? isComp : !isComp
  })

  return (
    <div className="history-page">
      <div className="page-header">
        <h2>Últimas partidas</h2>
        <div className="header-actions">
          <div className="filter-chips">
            {(
              [
                ['all', 'Todas'],
                ['comp', 'Competitivo'],
                ['other', 'Otros modos']
              ] as Array<[Filter, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                className={`chip ${filter === id ? 'active' : ''}`}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <button className="btn" onClick={() => void load()} disabled={loading}>
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">⚠ {error}</div>}
      {loading && items === null && <div className="loading">Cargando historial…</div>}
      {items && filtered.length === 0 && !loading && (
        <div className="loading">No hay partidas con este filtro.</div>
      )}

      {items && (
        <div className="match-list">
          {filtered.map((m) => (
            <MatchCard
              key={m.matchId}
              m={m}
              open={openId === m.matchId}
              board={boards[m.matchId]}
              onToggle={() => toggle(m.matchId)}
            />
          ))}
        </div>
      )}

      {items && !reachedEnd && (
        <div className="load-more">
          <button className="btn btn-ghost" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? 'Cargando…' : 'Cargar más partidas'}
          </button>
        </div>
      )}
    </div>
  )
}
