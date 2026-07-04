import type {
  LastMeeting,
  LivePlayer,
  LiveStats,
  RankInfo,
  Snapshot
} from '../../../shared/types'
import { RankBadge } from '../components/RankBadge'

function timeAgo(ms: number): string {
  if (!ms) return ''
  const min = Math.round((Date.now() - ms) / 60000)
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const days = Math.round(h / 24)
  return days === 1 ? 'ayer' : `hace ${days} días`
}

function meetingTitle(m: LastMeeting): string {
  const base = m.enemy ? 'Jugaste contra él' : 'Jugó en tu equipo'
  const result = m.won === null ? '' : m.won ? ' · ganaste' : ' · perdiste'
  return `${base} ${timeAgo(m.startedAt)}${result}`
}

function FormCell({ s }: { s: LiveStats }): JSX.Element {
  const hasWr = s.winrate !== null
  const hasForm = s.kd !== null || s.hsPct !== null || s.adr !== null
  if (!hasWr && !hasForm) {
    return s.loading ? (
      <span className="form-loading">···</span>
    ) : (
      <span className="prev-none">—</span>
    )
  }
  const wrClass = !hasWr ? '' : s.winrate! >= 55 ? 'wr-good' : s.winrate! <= 45 ? 'wr-bad' : ''
  return (
    <div className="form-cell">
      <div className="form-line">
        {hasWr ? (
          <span className={wrClass} title={`Sobre ${s.wrGames} competitivas`}>
            {s.winrate}% WR
            {s.wrGames < 10 && <span className="form-dim"> ({s.wrGames})</span>}
          </span>
        ) : (
          <span className="form-dim">— WR</span>
        )}
        {s.kd !== null && <span className="form-dim"> · KD {s.kd.toFixed(2)}</span>}
      </div>
      <div className="form-line form-sub">
        {s.hsPct !== null && <span>HS {s.hsPct}%</span>}
        {s.hsPct !== null && s.adr !== null && <span> · </span>}
        {s.adr !== null && <span>ADR {s.adr}</span>}
        {s.loading && <span> ···</span>}
      </div>
    </div>
  )
}

function PlayerRow({ p }: { p: LivePlayer }): JSX.Element {
  // Progreso hacia el siguiente rango (Inmortal+ no tiene tope de 100 RR)
  const rrPct = p.rank.tier > 0 ? Math.min(p.rank.rr, 100) : 0

  return (
    <tr className={`player-row ${p.isSelf ? 'self' : ''}`}>
      <td className="cell-agent">
        {p.agentIcon ? (
          <img
            className="agent-icon"
            src={p.agentIcon}
            alt={p.agentName ?? ''}
            title={p.agentName ?? ''}
          />
        ) : (
          <span className="agent-placeholder">?</span>
        )}
      </td>
      <td className="cell-name">
        <div className="player-line">
          <span className="player-name">{p.name}</span>
          {p.tag && <span className="player-tag">#{p.tag}</span>}
          {p.isSelf && <span className="badge-self">tú</span>}
        </div>
        <div className="player-sub">{p.agentName ?? 'Sin agente'}</div>
      </td>
      <td className="cell-rank">
        <RankBadge rank={p.rank} />
        {p.rank.tier > 0 && (
          <div className="rr-progress" title={`${p.rank.rr} RR`}>
            <div className="rr-progress-fill" style={{ width: `${rrPct}%` }} />
          </div>
        )}
      </td>
      <td className="cell-peak">
        <RankBadge rank={p.peak} showRR={false} />
      </td>
      <td className="cell-form">
        <FormCell s={p.stats} />
      </td>
      <td className="cell-level">
        {p.level > 0 ? p.level : <span title="Nivel oculto">—</span>}
      </td>
      <td className="cell-meet">
        {p.lastMeeting && (
          <span
            className={`meet-icon ${p.lastMeeting.enemy ? 'vs' : 'with'}`}
            title={meetingTitle(p.lastMeeting)}
          >
            {p.lastMeeting.enemy ? (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              >
                <path d="M5 5l14 14M19 5L5 19" />
              </svg>
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3l7 3v5c0 4.6-3 7.7-7 9-4-1.3-7-4.4-7-9V6z" />
              </svg>
            )}
          </span>
        )}
      </td>
    </tr>
  )
}

function TeamTable({
  title,
  players,
  avg,
  cls
}: {
  title: string
  players: LivePlayer[]
  avg: RankInfo | null
  cls: string
}): JSX.Element {
  return (
    <div className={`team-block ${cls}`}>
      <div className="team-head">
        <h3 className="team-title">{title}</h3>
        {avg && (
          <div className="team-avg">
            <span className="team-avg-label">Promedio</span>
            {avg.icon && <img className="team-avg-icon" src={avg.icon} alt="" />}
            <span className="team-avg-name">{avg.name}</span>
          </div>
        )}
      </div>
      <table className="player-table">
        <thead>
          <tr>
            <th></th>
            <th>Jugador</th>
            <th>Rango</th>
            <th>Máximo</th>
            <th title="Winrate: últimas 20 competitivas · KD/HS/ADR: últimas 5 partidas">
              Forma
            </th>
            <th>Nivel</th>
            <th title="Cruces previos: escudo = jugó contigo, aspas = contra ti">Visto</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <PlayerRow key={p.puuid} p={p} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function LivePage({ snapshot }: { snapshot: Snapshot }): JSX.Element {
  const { state, live, menus } = snapshot

  if (state === 'offline') {
    return (
      <div className="empty-state">
        <h2>Esperando a VALORANT</h2>
        <p>Abre VALORANT y ValTrack detectará tu partida automáticamente.</p>
      </div>
    )
  }

  if (state === 'menus' || !live) {
    const members = menus?.members ?? []
    const ghosts = Math.max(0, 5 - members.length)

    return (
      <div className="lobby">
        <h2 className="lobby-title">En los menús</h2>
        <p className="lobby-sub">
          Cuando entres en una partida verás aquí los rangos y la forma de los 10 jugadores.
        </p>
        {menus?.queueName && (
          <div className="menus-info">
            <span>Cola: {menus.queueName}</span>
          </div>
        )}

        {members.length > 0 && (
          <div className="lobby-banners">
            {members.map((m) => {
              // Para ti usamos el rango del perfil (incluye RR); las presencias no lo traen
              const rank = m.isSelf ? snapshot.self?.rank ?? m.rank : m.rank
              return (
                <div key={m.puuid} className={`banner ${m.isSelf ? 'self' : ''}`}>
                  {m.card ? (
                    <img className="banner-art" src={m.card} alt="" />
                  ) : (
                    <div className="banner-art banner-art-empty" />
                  )}
                  {m.level != null && <div className="banner-level">{m.level}</div>}
                  <div className="banner-bottom">
                    <div className="banner-name">
                      {m.name}
                      {m.tag && <span className="banner-tag">#{m.tag}</span>}
                    </div>
                    <div className="banner-rank">
                      {rank?.icon && <img src={rank.icon} alt="" />}
                      <span>{rank?.name ?? 'Sin clasificar'}</span>
                      {m.isSelf && rank && rank.tier > 0 && rank.rr > 0 && (
                        <span className="banner-rr">{rank.rr} RR</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            {Array.from({ length: ghosts }, (_, i) => (
              <div key={`ghost-${i}`} className="banner ghost">
                <span>+</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const allies = live.players.filter((p) => !p.enemy)
  const enemies = live.players.filter((p) => p.enemy)

  return (
    <div className="live-page">
      <header
        className="live-hero"
        style={
          live.mapSplash
            ? { backgroundImage: `url(${live.mapSplash})` }
            : undefined
        }
      >
        <div className="live-hero-overlay">
          <div className="live-hero-text">
            <h2 className="live-map">{live.mapName}</h2>
            <div className="live-meta">
              <span className="live-mode">{live.mode}</span>
              <span className={`live-state ${live.state}`}>
                {live.state === 'pregame' ? 'Selección de agentes' : 'En partida'}
              </span>
            </div>
          </div>
          {live.allyAvg && live.enemyAvg && (
            <div className="live-vs">
              <div className="live-vs-side">
                {live.allyAvg.icon && <img src={live.allyAvg.icon} alt="" />}
                <span>{live.allyAvg.name}</span>
              </div>
              <span className="live-vs-sep">vs</span>
              <div className="live-vs-side">
                {live.enemyAvg.icon && <img src={live.enemyAvg.icon} alt="" />}
                <span>{live.enemyAvg.name}</span>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="teams">
        <TeamTable title="Tu equipo" players={allies} avg={live.allyAvg} cls="allies" />
        {enemies.length > 0 && (
          <TeamTable
            title="Equipo enemigo"
            players={enemies}
            avg={live.enemyAvg}
            cls="enemies"
          />
        )}
      </div>
    </div>
  )
}
