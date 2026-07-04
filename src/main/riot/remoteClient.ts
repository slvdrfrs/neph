import { requestJson, HttpError, sleep } from './http'
import type { Tokens } from './localClient'
import type { RegionInfo } from './region'

// Blob estándar de plataforma que esperan los servidores de Riot
const CLIENT_PLATFORM = Buffer.from(
  JSON.stringify({
    platformType: 'PC',
    platformOS: 'Windows',
    platformOSVersion: '10.0.19042.1.256.64bit',
    platformChipset: 'Unknown'
  })
).toString('base64')

export interface SeasonalInfo {
  SeasonID: string
  CompetitiveTier: number
  RankedRating: number
  WinsByTier: Record<string, number> | null
  NumberOfGames: number
}

export interface MMRResponse {
  Version: number
  Subject: string
  QueueSkills?: {
    competitive?: {
      SeasonalInfoBySeasonID?: Record<string, SeasonalInfo> | null
    }
  }
  LatestCompetitiveUpdate?: {
    TierAfterUpdate: number
    RankedRatingAfterUpdate: number
    SeasonID?: string
  } | null
}

export interface ContentSeason {
  ID: string
  Name: string
  Type: string
  IsActive: boolean
}

export interface NameServiceEntry {
  Subject: string
  GameName: string
  TagLine: string
}

export interface PlayerIdentity {
  Subject?: string
  PlayerCardID?: string
  AccountLevel?: number
  Incognito?: boolean
  HideAccountLevel?: boolean
}

export interface CoreGamePlayer {
  Subject: string
  TeamID: string
  CharacterID: string
  PlayerIdentity?: PlayerIdentity
}

export interface CoreGameMatch {
  MatchID: string
  MapID: string
  ModeID: string
  Players: CoreGamePlayer[]
  MatchmakingData?: { QueueID?: string } | null
}

export interface PregamePlayer {
  Subject: string
  CharacterID: string
  CharacterSelectionState: string
  PlayerIdentity?: PlayerIdentity
}

export interface PregameMatch {
  ID: string
  MapID: string
  Mode?: string
  QueueID?: string
  AllyTeam?: { TeamID: string; Players: PregamePlayer[] } | null
  Teams?: Array<{ TeamID: string; Players: PregamePlayer[] }>
}

export interface CompetitiveUpdateMatch {
  MatchID: string
  MapID: string
  MatchStartTime: number
  TierAfterUpdate: number
  TierBeforeUpdate: number
  RankedRatingAfterUpdate: number
  RankedRatingBeforeUpdate: number
  RankedRatingEarned: number
}

export interface MatchHistoryEntry {
  MatchID: string
  GameStartTime: number
  QueueID: string
}

/** Cliente para los servidores de juego de Riot (pd / glz / shared). */
export class RemoteClient {
  private pd: string
  private glz: string
  private shared: string

  constructor(
    regionInfo: RegionInfo,
    private tokens: Tokens,
    private clientVersion: string
  ) {
    this.pd = `https://pd.${regionInfo.shard}.a.pvp.net`
    this.glz = `https://glz-${regionInfo.region}-1.${regionInfo.shard}.a.pvp.net`
    this.shared = `https://shared.${regionInfo.shard}.a.pvp.net`
  }

  updateTokens(tokens: Tokens): void {
    this.tokens = tokens
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.tokens.accessToken}`,
      'X-Riot-Entitlements-JWT': this.tokens.entitlementToken,
      'X-Riot-ClientPlatform': CLIENT_PLATFORM,
      'X-Riot-ClientVersion': this.clientVersion
    }
  }

  /** GET con reintento ante rate limit (429): espera exponencial, hasta 3 reintentos. */
  private async get<T>(url: string, attempt = 0): Promise<T> {
    try {
      return await requestJson<T>(url, { headers: this.headers() })
    } catch (e) {
      if (e instanceof HttpError && e.status === 429 && attempt < 3) {
        await sleep(2500 * 2 ** attempt + Math.floor(Math.random() * 500))
        return this.get(url, attempt + 1)
      }
      throw e
    }
  }

  /** Lista de temporadas (episodios y actos) en orden cronológico. */
  async getSeasons(): Promise<ContentSeason[]> {
    const r = await this.get<{ Seasons: ContentSeason[] }>(
      `${this.shared}/content-service/v3/content`
    )
    return r.Seasons ?? []
  }

  getMMR(puuid: string): Promise<MMRResponse> {
    return this.get(`${this.pd}/mmr/v1/players/${puuid}`)
  }

  getCompetitiveUpdates(puuid: string, count = 15): Promise<{ Matches: CompetitiveUpdateMatch[] }> {
    return this.get(
      `${this.pd}/mmr/v1/players/${puuid}/competitiveupdates?startIndex=0&endIndex=${count}&queue=competitive`
    )
  }

  getMatchHistory(
    puuid: string,
    startIndex = 0,
    endIndex = 12
  ): Promise<{ History: MatchHistoryEntry[] }> {
    return this.get(
      `${this.pd}/match-history/v1/history/${puuid}?startIndex=${startIndex}&endIndex=${endIndex}`
    )
  }

  getMatchDetails(matchId: string): Promise<Record<string, unknown>> {
    return this.get(`${this.pd}/match-details/v1/matches/${matchId}`)
  }

  /** Loadout propio: incluye la tarjeta de jugador equipada. Solo funciona para tu puuid. */
  getPlayerLoadout(puuid: string): Promise<{ Identity?: { PlayerCardID?: string } }> {
    return this.get(`${this.pd}/personalization/v10/players/${puuid}/playerloadout`)
  }

  /** Nombres reales a partir de PUUIDs (revela nombres ocultos / incógnito). */
  async getNames(puuids: string[]): Promise<Map<string, { name: string; tag: string }>> {
    if (puuids.length === 0) return new Map()
    const r = await requestJson<NameServiceEntry[]>(
      `${this.pd}/name-service/v2/players`,
      { method: 'PUT', headers: this.headers(), body: puuids }
    )
    const map = new Map<string, { name: string; tag: string }>()
    for (const e of r) map.set(e.Subject, { name: e.GameName, tag: e.TagLine })
    return map
  }

  /** null si no está en partida. */
  async getCoreGameMatchId(puuid: string): Promise<string | null> {
    try {
      const r = await this.get<{ MatchID: string }>(
        `${this.glz}/core-game/v1/players/${puuid}`
      )
      return r.MatchID
    } catch (e) {
      if (e instanceof HttpError && (e.status === 404 || e.status === 400)) return null
      throw e
    }
  }

  getCoreGameMatch(matchId: string): Promise<CoreGameMatch> {
    return this.get(`${this.glz}/core-game/v1/matches/${matchId}`)
  }

  /** null si no está en selección de agentes. */
  async getPregameMatchId(puuid: string): Promise<string | null> {
    try {
      const r = await this.get<{ MatchID: string }>(
        `${this.glz}/pregame/v1/players/${puuid}`
      )
      return r.MatchID
    } catch (e) {
      if (e instanceof HttpError && (e.status === 404 || e.status === 400)) return null
      throw e
    }
  }

  getPregameMatch(matchId: string): Promise<PregameMatch> {
    return this.get(`${this.glz}/pregame/v1/matches/${matchId}`)
  }
}
