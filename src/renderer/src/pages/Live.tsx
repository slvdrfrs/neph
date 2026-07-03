import type { LivePlayer, RankInfo, Snapshot } from '../../../shared/types'
import { RankBadge } from '../components/RankBadge'

const PARTY_COLORS = ['#ff4655', '#3fd0c9', '#f0b232', '#a06bff', '#57cbde', '#8ce563']

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
          {p.incognito && (
            <span className="badge-incognito" title="Este jugador juega en modo incógnito">
              oculto
            </span>
          )}
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
      <td className="cell-level">
        {p.level > 0 ? p.level : <span title="Nivel oculto">—</span>}
      </td>
      <td className="cell-party">
        {p.partyIndex !== null && (
          <span
            className="party-dot"
            title={`Grupo ${p.partyIndex}`}
            style={{
              background: PARTY_COLORS[(p.partyIndex - 1) % PARTY_COLORS.length],
              color: PARTY_COLORS[(p.partyIndex - 1) % PARTY_COLORS.length]
            }}
          />
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
            <th>Nivel</th>
            <th></th>
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
    return (
      <div className="empty-state">
        <h2>Estás en los menús</h2>
        <p>
          Cuando entres en una partida verás aquí los rangos, niveles y grupos de todos los
          jugadores.
        </p>
        {menus && (menus.queueName || menus.partySize) && (
          <div className="menus-info">
            {menus.queueName && <span>Cola: {menus.queueName}</span>}
            {menus.partySize != null && menus.partySize > 1 && (
              <span>Grupo de {menus.partySize}</span>
            )}
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
