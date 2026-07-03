// Tipos compartidos entre el proceso principal (Electron) y el renderer (React)

export type GameState = 'offline' | 'menus' | 'pregame' | 'ingame'

export interface RankInfo {
  tier: number
  name: string
  icon: string | null
  rr: number
}

export interface LivePlayer {
  puuid: string
  name: string
  tag: string
  teamId: string
  enemy: boolean
  agentId: string | null
  agentName: string | null
  agentIcon: string | null
  rank: RankInfo
  peak: RankInfo | null
  level: number
  hideLevel: boolean
  incognito: boolean
  /** Índice de grupo (party). null = va solo o desconocido */
  partyIndex: number | null
  isSelf: boolean
}

export interface LiveMatch {
  matchId: string
  mapName: string
  mapIcon: string | null
  mapSplash: string | null
  mode: string
  state: 'pregame' | 'ingame'
  players: LivePlayer[]
  allyTeamId: string | null
  allyAvg: RankInfo | null
  enemyAvg: RankInfo | null
}

export interface SelfInfo {
  puuid: string
  name: string
  tag: string
  rank: RankInfo | null
  peak: RankInfo | null
  level: number | null
  /** Tarjeta de jugador (banner ancho) */
  cardWide: string | null
  /** Tarjeta de jugador (avatar cuadrado) */
  cardSmall: string | null
}

export interface MenusInfo {
  queueName: string | null
  partySize: number | null
}

export interface Snapshot {
  state: GameState
  updatedAt: number
  self: SelfInfo | null
  live: LiveMatch | null
  menus: MenusInfo | null
  error: string | null
  region: string | null
}

export interface HistoryItem {
  matchId: string
  queue: string
  mapName: string
  mapIcon: string | null
  startedAt: number
  lengthMs: number
  agentName: string | null
  agentIcon: string | null
  kills: number
  deaths: number
  assists: number
  score: number
  /** null = empate o modo sin resultado por equipos */
  won: boolean | null
  roundsWon: number
  roundsLost: number
  rrDelta: number | null
}

export interface CompUpdate {
  matchId: string
  startedAt: number
  tierAfter: number
  tierName: string
  tierIcon: string | null
  rrAfter: number
  delta: number
  mapName: string | null
}

export interface ProfileData {
  self: SelfInfo
  updates: CompUpdate[]
}

export interface TrackerApi {
  getState: () => Promise<Snapshot>
  getHistory: () => Promise<HistoryItem[] | { error: string }>
  getProfile: () => Promise<ProfileData | { error: string }>
  refresh: () => Promise<void>
  onState: (cb: (s: Snapshot) => void) => () => void
}
