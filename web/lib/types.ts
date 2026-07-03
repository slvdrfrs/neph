export interface RankChip {
  name: string
  /** Grupo para colorear: iron, bronze, silver, gold, platinum, diamond, ascendant, immortal, radiant, unranked */
  group: string
  rr: number
}

export interface ProfileMatch {
  id: string
  map: string
  mode: string
  agent: string
  kills: number
  deaths: number
  assists: number
  won: boolean | null
  rrDelta: number | null
  startedAt: string
}

export interface PlayerProfile {
  name: string
  tag: string
  region: string
  level: number | null
  rank: RankChip
  peak: RankChip | null
  /** Sobre las últimas partidas competitivas */
  winrate: number | null
  kd: number | null
  matches: ProfileMatch[]
  updatedAt: string
  /** true = datos de ejemplo (sin HENRIK_API_KEY configurada) */
  demo: boolean
}

/** Grupo de color a partir del nombre del rango (es/en) */
export function rankGroup(rankName: string): string {
  const n = rankName.toLowerCase()
  if (n.includes('hierro') || n.includes('iron')) return 'iron'
  if (n.includes('bronce') || n.includes('bronze')) return 'bronze'
  if (n.includes('plata') || n.includes('silver')) return 'silver'
  if (n.includes('oro') || n.includes('gold')) return 'gold'
  if (n.includes('platino') || n.includes('platinum')) return 'platinum'
  if (n.includes('diamante') || n.includes('diamond')) return 'diamond'
  if (n.includes('ascendente') || n.includes('ascendant')) return 'ascendant'
  if (n.includes('inmortal') || n.includes('immortal')) return 'immortal'
  if (n.includes('radiante') || n.includes('radiant')) return 'radiant'
  return 'unranked'
}
