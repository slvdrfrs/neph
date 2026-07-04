// Tipos compartidos entre el proceso principal (Electron) y el renderer (React)

export type GameState = 'offline' | 'menus' | 'pregame' | 'ingame'

export interface RankInfo {
  tier: number
  name: string
  icon: string | null
  rr: number
}

/** Forma reciente de un jugador (se carga progresivamente) */
export interface LiveStats {
  /** % de victorias en las últimas partidas competitivas (hasta 20) */
  winrate: number | null
  /** Tamaño de la muestra del winrate */
  wrGames: number
  /** KD sobre las últimas partidas analizadas */
  kd: number | null
  /** % de headshots */
  hsPct: number | null
  /** Daño medio por ronda */
  adr: number | null
  /** Partidas usadas para KD/HS/ADR */
  statsGames: number
  /** true = aún se están descargando datos */
  loading: boolean
}

/** Último cruce con este jugador en tus partidas recientes */
export interface LastMeeting {
  /** true = aquella vez estaba en el equipo enemigo */
  enemy: boolean
  startedAt: number
  /** Resultado para ti (null = empate o modo sin equipos) */
  won: boolean | null
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
  stats: LiveStats
  /** null = primera vez que te lo cruzas (en tus últimas ~15 partidas) */
  lastMeeting: LastMeeting | null
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

/** Miembro de tu grupo en el lobby (desde las presencias) */
export interface PartyMember {
  puuid: string
  name: string
  tag: string
  level: number | null
  rank: RankInfo | null
  /** Arte vertical de su tarjeta de jugador */
  card: string | null
  isSelf: boolean
}

export interface MenusInfo {
  queueName: string | null
  partySize: number | null
  members: PartyMember[]
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
  hsPct: number | null
  adr: number | null
}

export interface ScoreboardPlayer {
  puuid: string
  name: string
  tag: string
  agentName: string | null
  agentIcon: string | null
  teamId: string
  tierName: string | null
  tierIcon: string | null
  acs: number
  kills: number
  deaths: number
  assists: number
  hsPct: number | null
  adr: number | null
  isSelf: boolean
}

export interface ScoreboardTeam {
  teamId: string
  won: boolean
  roundsWon: number
}

export interface Scoreboard {
  matchId: string
  teams: ScoreboardTeam[]
  players: ScoreboardPlayer[]
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

/** Carrera de cualquier jugador (al hacer clic en él) */
export interface CareerData {
  puuid: string
  name: string
  tag: string
  rank: RankInfo
  peak: RankInfo | null
  winrate: number | null
  wrGames: number
  kd: number | null
  hsPct: number | null
  adr: number | null
  /** Últimas partidas competitivas con su RR */
  updates: CompUpdate[]
  /** Últimas partidas analizadas en detalle */
  matches: HistoryItem[]
}

export interface TrackerApi {
  getState: () => Promise<Snapshot>
  getHistory: (start?: number) => Promise<HistoryItem[] | { error: string }>
  getScoreboard: (matchId: string) => Promise<Scoreboard | { error: string }>
  getCareer: (
    puuid: string,
    name: string,
    tag: string
  ) => Promise<CareerData | { error: string }>
  getProfile: () => Promise<ProfileData | { error: string }>
  refresh: () => Promise<void>
  onState: (cb: (s: Snapshot) => void) => () => void
}
