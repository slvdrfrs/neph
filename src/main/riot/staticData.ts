import { requestJson } from './http'

const LANG = 'es-ES'
const BASE = 'https://valorant-api.com/v1'

export interface AgentInfo {
  name: string
  icon: string
}

export interface TierInfo {
  name: string
  icon: string | null
}

export interface MapInfo {
  name: string
  icon: string | null
  splash: string | null
}

/** Nombres de cola legibles en español */
export const QUEUE_NAMES: Record<string, string> = {
  competitive: 'Competitivo',
  unrated: 'Normal',
  swiftplay: 'Partida rápida',
  spikerush: 'Spike Rush',
  deathmatch: 'Combate a muerte',
  hurm: 'Duelo por equipos',
  ggteam: 'Escalada',
  onefa: 'Replicación',
  premier: 'Premier',
  snowball: 'Bolas de nieve',
  newmap: 'Mapa nuevo',
  '': 'Personalizada'
}

export function queueName(queueId: string | null | undefined): string {
  if (queueId == null) return 'Desconocido'
  return QUEUE_NAMES[queueId] ?? queueId
}

/**
 * Datos estáticos de valorant-api.com (no requiere autenticación):
 * agentes, iconos de rango, mapas y versión del cliente.
 */
export class StaticData {
  private agents = new Map<string, AgentInfo>()
  private tiers = new Map<number, TierInfo>()
  private maps = new Map<string, MapInfo>()
  private oldActs = new Set<string>()
  private clientVersion: string | null = null
  private loaded = false

  async load(): Promise<void> {
    if (this.loaded) return
    const [version, agents, tiers, maps, seasons] = await Promise.all([
      requestJson<{ data: { riotClientVersion: string } }>(`${BASE}/version`),
      requestJson<{
        data: Array<{ uuid: string; displayName: string; displayIcon: string }>
      }>(`${BASE}/agents?isPlayableCharacter=true&language=${LANG}`),
      requestJson<{
        data: Array<{
          tiers: Array<{ tier: number; tierName: string; largeIcon: string | null }>
        }>
      }>(`${BASE}/competitivetiers?language=${LANG}`),
      requestJson<{
        data: Array<{
          mapUrl: string
          displayName: string
          listViewIcon: string | null
          splash: string | null
        }>
      }>(`${BASE}/maps?language=${LANG}`),
      requestJson<{
        data: Array<{ uuid: string; type: string | null; startTime: string }>
      }>(`${BASE}/seasons`)
    ])

    this.clientVersion = version.data.riotClientVersion

    for (const a of agents.data) {
      this.agents.set(a.uuid.toLowerCase(), { name: a.displayName, icon: a.displayIcon })
    }

    // El último elemento es el episodio actual (los anteriores son sets antiguos)
    const latestTiers = tiers.data[tiers.data.length - 1]?.tiers ?? []
    for (const t of latestTiers) {
      this.tiers.set(t.tier, { name: t.tierName, icon: t.largeIcon })
    }

    for (const m of maps.data) {
      this.maps.set(m.mapUrl, {
        name: m.displayName,
        icon: m.listViewIcon,
        splash: m.splash
      })
    }

    // Actos anteriores al Episodio 5 (22 jun 2022, cuando se añadió Ascendente):
    // sus tiers 21-24 corresponden a Inmortal/Radiante en la escala actual.
    const EP5_START = Date.parse('2022-06-20T00:00:00Z')
    for (const s of seasons.data) {
      const isAct = (s.type ?? '').toLowerCase().includes('act')
      if (isAct && Date.parse(s.startTime) < EP5_START) {
        this.oldActs.add(s.uuid.toLowerCase())
      }
    }

    this.loaded = true
  }

  /** ¿Es un acto anterior a la introducción de Ascendente (Ep. 5)? */
  isOldAct(seasonId: string): boolean {
    return this.oldActs.has(seasonId.toLowerCase())
  }

  private cards = new Map<
    string,
    { wide: string | null; small: string | null; large: string | null }
  >()

  /** Arte de una tarjeta de jugador (con caché). */
  async playerCard(
    cardId: string
  ): Promise<{ wide: string | null; small: string | null; large: string | null }> {
    const cached = this.cards.get(cardId)
    if (cached) return cached
    const r = await requestJson<{
      data: { wideArt: string | null; smallArt: string | null; largeArt: string | null }
    }>(`${BASE}/playercards/${cardId}`)
    const entry = { wide: r.data.wideArt, small: r.data.smallArt, large: r.data.largeArt }
    this.cards.set(cardId, entry)
    return entry
  }

  get version(): string {
    return this.clientVersion ?? ''
  }

  agent(id: string | null | undefined): AgentInfo | null {
    if (!id) return null
    return this.agents.get(id.toLowerCase()) ?? null
  }

  tier(n: number): TierInfo {
    return this.tiers.get(n) ?? { name: `Tier ${n}`, icon: null }
  }

  map(mapUrl: string | null | undefined): MapInfo {
    if (!mapUrl) return { name: 'Desconocido', icon: null, splash: null }
    return (
      this.maps.get(mapUrl) ?? {
        name: mapUrl.split('/').pop() ?? '?',
        icon: null,
        splash: null
      }
    )
  }
}
