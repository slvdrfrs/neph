import type { GameState } from '../../../shared/types'

const LABELS: Record<GameState, { text: string; cls: string }> = {
  offline: { text: 'VALORANT cerrado', cls: 'offline' },
  menus: { text: 'En los menús', cls: 'menus' },
  pregame: { text: 'Selección de agentes', cls: 'pregame' },
  ingame: { text: 'En partida', cls: 'ingame' }
}

export function StatusPill({
  state,
  region
}: {
  state: GameState
  region: string | null
}): JSX.Element {
  const l = LABELS[state]
  return (
    <div className={`status-pill ${l.cls}`}>
      <span className="status-dot" />
      {l.text}
      {region && state !== 'offline' && (
        <span className="status-region">{region.toUpperCase()}</span>
      )}
    </div>
  )
}
