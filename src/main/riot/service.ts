import { readLockfile } from './lockfile'
import { detectRegion, detectClientVersion, type RegionInfo } from './region'
import { LocalClient, type Presence, type Tokens } from './localClient'
import {
  RemoteClient,
  type MMRResponse,
  type PlayerIdentity
} from './remoteClient'
import { StaticData, queueName } from './staticData'
import type {
  Snapshot,
  LivePlayer,
  LiveMatch,
  RankInfo,
  SelfInfo,
  HistoryItem,
  ProfileData,
  CompUpdate
} from '../../shared/types'

const POLL_MS = 5000
const MMR_CACHE_MS = 90_000

interface CachedMMR {
  at: number
  rank: RankInfo
  peak: RankInfo | null
}

/** Ejecuta promesas con un límite de concurrencia (evita rate limits de Riot). */
async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return results
}

export class TrackerService {
  readonly statics = new StaticData()
  snapshot: Snapshot = {
    state: 'offline',
    updatedAt: 0,
    self: null,
    live: null,
    menus: null,
    error: null,
    region: null
  }

  private local: LocalClient | null = null
  private remote: RemoteClient | null = null
  private regionInfo: RegionInfo | null = null
  private tokens: Tokens | null = null
  private clientVersion: string | null = null
  private activeSeasonId: string | null = null
  private timer: NodeJS.Timeout | null = null
  private polling = false
  private onUpdate: ((s: Snapshot) => void) | null = null

  private mmrCache = new Map<string, CachedMMR>()
  private nameCache = new Map<string, { name: string; tag: string }>()
  private detailsCache = new Map<string, Record<string, unknown>>()
  private lastMatchId: string | null = null
  private lastLive: LiveMatch | null = null

  start(onUpdate: (s: Snapshot) => void): void {
    this.onUpdate = onUpdate
    void this.pollNow()
    this.timer = setInterval(() => void this.pollNow(), POLL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  async pollNow(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      await this.poll()
      this.snapshot.error = null
    } catch (e) {
      this.snapshot = {
        ...this.snapshot,
        error: (e as Error).message,
        updatedAt: Date.now()
      }
    } finally {
      this.polling = false
      this.onUpdate?.(this.snapshot)
    }
  }

  // ---------------------------------------------------------------- poll ----

  private async poll(): Promise<void> {
    const lockfile = await readLockfile()
    if (!lockfile) {
      this.local = null
      this.remote = null
      this.tokens = null
      this.lastMatchId = null
      this.lastLive = null
      this.snapshot = {
        state: 'offline',
        updatedAt: Date.now(),
        self: null,
        live: null,
        menus: null,
        error: null,
        region: this.regionInfo?.region ?? null
      }
      return
    }

    this.local = new LocalClient(lockfile)

    let tokens: Tokens
    try {
      tokens = await this.local.getTokens()
    } catch {
      // Riot Client abierto pero sesión aún no lista
      this.snapshot = {
        state: 'offline',
        updatedAt: Date.now(),
        self: null,
        live: null,
        menus: null,
        error: null,
        region: this.regionInfo?.region ?? null
      }
      return
    }
    this.tokens = tokens

    await this.statics.load()

    if (!this.regionInfo) {
      this.regionInfo = (await detectRegion()) ?? { region: 'na', shard: 'na' }
    }

    if (!this.clientVersion) {
      // La versión del log es la real; valorant-api.com puede ir una build atrás
      this.clientVersion = (await detectClientVersion()) ?? this.statics.version
    }

    if (!this.remote) {
      this.remote = new RemoteClient(this.regionInfo, tokens, this.clientVersion)
    } else {
      this.remote.updateTokens(tokens)
    }

    if (!this.activeSeasonId) {
      try {
        const seasons = await this.remote.getSeasons()
        this.activeSeasonId =
          seasons.find((s) => s.Type === 'act' && s.IsActive)?.ID ?? null
      } catch {
        this.activeSeasonId = null
      }
    }

    const puuid = tokens.puuid
    const presences = await this.local.getPresences().catch(() => [] as Presence[])
    const selfPresence = presences.find((p) => p.puuid === puuid) ?? null

    // ¿En partida?
    const coreMatchId = await this.remote.getCoreGameMatchId(puuid).catch(() => null)
    if (coreMatchId) {
      const live = await this.buildCoreGame(coreMatchId, puuid, presences)
      this.snapshot = {
        state: 'ingame',
        updatedAt: Date.now(),
        self: await this.buildSelf(puuid, presences),
        live,
        menus: null,
        error: null,
        region: this.regionInfo.region
      }
      return
    }

    // ¿En selección de agentes?
    const pregameId = await this.remote.getPregameMatchId(puuid).catch(() => null)
    if (pregameId) {
      const live = await this.buildPregame(pregameId, puuid, presences)
      this.snapshot = {
        state: 'pregame',
        updatedAt: Date.now(),
        self: await this.buildSelf(puuid, presences),
        live,
        menus: null,
        error: null,
        region: this.regionInfo.region
      }
      return
    }

    // En menús
    this.lastMatchId = null
    this.lastLive = null
    this.snapshot = {
      state: 'menus',
      updatedAt: Date.now(),
      self: await this.buildSelf(puuid, presences),
      live: null,
      menus: {
        queueName: selfPresence?.private?.queueId != null
          ? queueName(selfPresence.private.queueId)
          : null,
        partySize: selfPresence?.private?.partySize ?? null
      },
      error: null,
      region: this.regionInfo.region
    }
  }

  // ------------------------------------------------------------- helpers ----

  private parseMMR(mmr: MMRResponse): { rank: RankInfo; peak: RankInfo | null } {
    const bySeason = mmr.QueueSkills?.competitive?.SeasonalInfoBySeasonID ?? {}

    let currentTier = 0
    let currentRR = 0
    if (this.activeSeasonId && bySeason && bySeason[this.activeSeasonId]) {
      currentTier = bySeason[this.activeSeasonId].CompetitiveTier ?? 0
      currentRR = bySeason[this.activeSeasonId].RankedRating ?? 0
    } else if (!this.activeSeasonId && mmr.LatestCompetitiveUpdate) {
      // Sin lista de temporadas: mejor el último update que nada
      currentTier = mmr.LatestCompetitiveUpdate.TierAfterUpdate ?? 0
      currentRR = mmr.LatestCompetitiveUpdate.RankedRatingAfterUpdate ?? 0
    }

    // Antes del Ep. 5 (Ascendente) los tiers 21-24 eran Inmortal 1-3 y Radiante;
    // en la escala actual equivalen a 24-27. Si una temporada tiene tiers >= 25
    // ya usa la escala nueva, así que no se remapea (autodetección de escala).
    let peakTier = currentTier
    for (const [seasonId, s] of Object.entries(bySeason ?? {})) {
      const tiers = [
        s.CompetitiveTier ?? 0,
        ...Object.keys(s.WinsByTier ?? {}).map(Number)
      ]
      const seasonMax = Math.max(...tiers)
      const isOldScale = this.statics.isOldAct(seasonId) && seasonMax <= 24
      for (const t of tiers) {
        const mapped = Math.min(isOldScale && t >= 21 ? t + 3 : t, 27)
        if (mapped > peakTier) peakTier = mapped
      }
    }

    const cur = this.statics.tier(currentTier)
    const rank: RankInfo = {
      tier: currentTier,
      name: cur.name,
      icon: cur.icon,
      rr: currentRR
    }
    let peak: RankInfo | null = null
    if (peakTier > 0) {
      const p = this.statics.tier(peakTier)
      peak = { tier: peakTier, name: p.name, icon: p.icon, rr: 0 }
    }
    return { rank, peak }
  }

  private async getRank(puuid: string): Promise<CachedMMR> {
    const cached = this.mmrCache.get(puuid)
    if (cached && Date.now() - cached.at < MMR_CACHE_MS) return cached
    try {
      const mmr = await this.remote!.getMMR(puuid)
      const parsed = this.parseMMR(mmr)
      const entry: CachedMMR = { at: Date.now(), ...parsed }
      this.mmrCache.set(puuid, entry)
      return entry
    } catch {
      const unranked = this.statics.tier(0)
      const entry: CachedMMR = {
        at: Date.now(),
        rank: { tier: 0, name: unranked.name, icon: unranked.icon, rr: 0 },
        peak: null
      }
      // No cachear errores mucho tiempo
      return entry
    }
  }

  private async resolveNames(
    puuids: string[]
  ): Promise<Map<string, { name: string; tag: string }>> {
    const missing = puuids.filter((p) => !this.nameCache.has(p))
    if (missing.length > 0) {
      try {
        const fetched = await this.remote!.getNames(missing)
        for (const [k, v] of fetched) this.nameCache.set(k, v)
      } catch {
        // seguimos con lo que haya en caché
      }
    }
    const out = new Map<string, { name: string; tag: string }>()
    for (const p of puuids) {
      out.set(p, this.nameCache.get(p) ?? { name: '', tag: '' })
    }
    return out
  }

  /** Asigna índices de party a partir de las presencias visibles. */
  private partyIndexes(
    presences: Presence[],
    puuids: Set<string>
  ): Map<string, number> {
    const byParty = new Map<string, string[]>()
    for (const p of presences) {
      const partyId = p.private?.partyId
      if (!partyId || !puuids.has(p.puuid)) continue
      const arr = byParty.get(partyId) ?? []
      arr.push(p.puuid)
      byParty.set(partyId, arr)
    }
    const out = new Map<string, number>()
    let idx = 1
    for (const members of byParty.values()) {
      if (members.length < 2) continue
      for (const m of members) out.set(m, idx)
      idx++
    }
    return out
  }

  private selfCardCache: {
    at: number
    wide: string | null
    small: string | null
  } | null = null

  /** Tarjeta de jugador equipada (caché de 5 min). */
  private async getSelfCard(
    puuid: string
  ): Promise<{ wide: string | null; small: string | null }> {
    if (this.selfCardCache && Date.now() - this.selfCardCache.at < 300_000) {
      return this.selfCardCache
    }
    try {
      const loadout = await this.remote!.getPlayerLoadout(puuid)
      const cardId = loadout.Identity?.PlayerCardID
      if (!cardId) throw new Error('sin tarjeta')
      const art = await this.statics.playerCard(cardId)
      this.selfCardCache = { at: Date.now(), ...art }
    } catch {
      this.selfCardCache = { at: Date.now(), wide: null, small: null }
    }
    return this.selfCardCache
  }

  private async buildSelf(puuid: string, presences: Presence[]): Promise<SelfInfo> {
    const names = await this.resolveNames([puuid])
    const n = names.get(puuid)!
    const { rank, peak } = await this.getRank(puuid)
    const card = await this.getSelfCard(puuid)
    const level = presences.find((p) => p.puuid === puuid)?.private?.accountLevel ?? null
    return {
      puuid,
      name: n.name || 'Tú',
      tag: n.tag,
      rank,
      peak,
      level,
      cardWide: card.wide,
      cardSmall: card.small
    }
  }

  /** Rango medio de un grupo de jugadores (ignora a los sin clasificar). */
  private teamAvg(players: LivePlayer[]): RankInfo | null {
    const ranked = players.filter((p) => p.rank.tier > 0)
    if (ranked.length === 0) return null
    const avg = Math.min(
      Math.round(ranked.reduce((acc, p) => acc + p.rank.tier, 0) / ranked.length),
      27
    )
    const info = this.statics.tier(avg)
    return { tier: avg, name: info.name, icon: info.icon, rr: 0 }
  }

  private async buildPlayers(
    entries: Array<{
      puuid: string
      teamId: string
      characterId: string | null
      identity: PlayerIdentity | undefined
    }>,
    selfPuuid: string,
    presences: Presence[]
  ): Promise<LivePlayer[]> {
    const puuids = entries.map((e) => e.puuid)
    const names = await this.resolveNames(puuids)
    const parties = this.partyIndexes(presences, new Set(puuids))
    const ranks = await pool(puuids, 4, (p) => this.getRank(p))
    const rankByPuuid = new Map(puuids.map((p, i) => [p, ranks[i]]))

    const selfTeam = entries.find((e) => e.puuid === selfPuuid)?.teamId ?? null

    return entries.map((e) => {
      const n = names.get(e.puuid)!
      const r = rankByPuuid.get(e.puuid)!
      const agent = this.statics.agent(e.characterId)
      // Riot censura el nombre de los jugadores en incógnito: mostramos el agente
      const displayName = n.name || agent?.name || 'Jugador oculto'
      return {
        puuid: e.puuid,
        name: displayName,
        tag: n.tag,
        teamId: e.teamId,
        enemy: selfTeam !== null && e.teamId !== selfTeam,
        agentId: e.characterId,
        agentName: agent?.name ?? null,
        agentIcon: agent?.icon ?? null,
        rank: r.rank,
        peak: r.peak,
        level: e.identity?.AccountLevel ?? 0,
        hideLevel: e.identity?.HideAccountLevel ?? false,
        incognito: e.identity?.Incognito ?? false,
        partyIndex: parties.get(e.puuid) ?? null,
        isSelf: e.puuid === selfPuuid
      }
    })
  }

  private async buildCoreGame(
    matchId: string,
    selfPuuid: string,
    presences: Presence[]
  ): Promise<LiveMatch> {
    // Reutiliza los datos si es la misma partida y son recientes (<30 s)
    if (
      this.lastMatchId === matchId &&
      this.lastLive &&
      Date.now() - this.snapshot.updatedAt < 30_000 &&
      this.snapshot.state === 'ingame'
    ) {
      return this.lastLive
    }

    const match = await this.remote!.getCoreGameMatch(matchId)
    const map = this.statics.map(match.MapID)
    const players = await this.buildPlayers(
      (match.Players ?? []).map((p) => ({
        puuid: p.Subject,
        teamId: p.TeamID,
        characterId: p.CharacterID || null,
        identity: p.PlayerIdentity
      })),
      selfPuuid,
      presences
    )

    const live: LiveMatch = {
      matchId,
      mapName: map.name,
      mapIcon: map.icon,
      mapSplash: map.splash,
      mode: queueName(match.MatchmakingData?.QueueID ?? null),
      state: 'ingame',
      players,
      allyTeamId: players.find((p) => p.isSelf)?.teamId ?? null,
      allyAvg: this.teamAvg(players.filter((p) => !p.enemy)),
      enemyAvg: this.teamAvg(players.filter((p) => p.enemy))
    }
    this.lastMatchId = matchId
    this.lastLive = live
    return live
  }

  private async buildPregame(
    matchId: string,
    selfPuuid: string,
    presences: Presence[]
  ): Promise<LiveMatch> {
    const match = await this.remote!.getPregameMatch(matchId)
    const map = this.statics.map(match.MapID)
    const teams = match.AllyTeam
      ? [match.AllyTeam]
      : (match.Teams ?? [])

    const entries = teams.flatMap((t) =>
      (t.Players ?? []).map((p) => ({
        puuid: p.Subject,
        teamId: t.TeamID,
        characterId: p.CharacterID || null,
        identity: p.PlayerIdentity
      }))
    )
    const players = await this.buildPlayers(entries, selfPuuid, presences)

    return {
      matchId,
      mapName: map.name,
      mapIcon: map.icon,
      mapSplash: map.splash,
      mode: queueName(match.QueueID ?? null),
      state: 'pregame',
      players,
      allyTeamId: players.find((p) => p.isSelf)?.teamId ?? null,
      allyAvg: this.teamAvg(players.filter((p) => !p.enemy)),
      enemyAvg: this.teamAvg(players.filter((p) => p.enemy))
    }
  }

  // ------------------------------------------------------------- history ----

  async getHistory(): Promise<HistoryItem[] | { error: string }> {
    if (!this.remote || !this.tokens) {
      return { error: 'VALORANT no está en ejecución.' }
    }
    const puuid = this.tokens.puuid
    try {
      const [history, updates] = await Promise.all([
        this.remote.getMatchHistory(puuid, 12),
        this.remote.getCompetitiveUpdates(puuid, 20).catch(() => ({ Matches: [] }))
      ])
      const rrByMatch = new Map(
        (updates.Matches ?? []).map((m) => [m.MatchID, m.RankedRatingEarned])
      )

      const items = await pool(history.History ?? [], 3, async (entry) => {
        try {
          let details = this.detailsCache.get(entry.MatchID)
          if (!details) {
            details = await this.remote!.getMatchDetails(entry.MatchID)
            this.detailsCache.set(entry.MatchID, details)
          }
          return this.parseMatchDetails(details, puuid, rrByMatch)
        } catch {
          return null
        }
      })
      return items.filter((i): i is HistoryItem => i !== null)
    } catch (e) {
      return { error: (e as Error).message }
    }
  }

  private parseMatchDetails(
    details: Record<string, unknown>,
    puuid: string,
    rrByMatch: Map<string, number>
  ): HistoryItem | null {
    const info = details['matchInfo'] as Record<string, unknown> | undefined
    const players = (details['players'] as Array<Record<string, unknown>>) ?? []
    const teams = (details['teams'] as Array<Record<string, unknown>>) ?? []
    if (!info) return null

    const me = players.find((p) => p['subject'] === puuid)
    if (!me) return null
    const stats = (me['stats'] as Record<string, number>) ?? {}
    const myTeamId = me['teamId'] as string
    const myTeam = teams.find((t) => t['teamId'] === myTeamId)
    const otherTeam = teams.find((t) => t['teamId'] !== myTeamId)

    const map = this.statics.map(info['mapId'] as string)
    const agent = this.statics.agent(me['characterId'] as string)
    const matchId = info['matchId'] as string
    const queueId = (info['queueID'] as string) ?? ''

    let won: boolean | null = null
    let roundsWon = 0
    let roundsLost = 0
    if (queueId === 'deathmatch') {
      // En DM "ganar" = quedar primero por kills
      const sorted = [...players].sort(
        (a, b) =>
          ((b['stats'] as Record<string, number>)?.['kills'] ?? 0) -
          ((a['stats'] as Record<string, number>)?.['kills'] ?? 0)
      )
      won = sorted[0]?.['subject'] === puuid
      roundsWon = stats['kills'] ?? 0
      roundsLost = 0
    } else if (myTeam) {
      won = (myTeam['won'] as boolean) ?? null
      roundsWon = (myTeam['roundsWon'] as number) ?? 0
      roundsLost = (otherTeam?.['roundsWon'] as number) ?? 0
      if (won === false && roundsWon === roundsLost) won = null // empate
    }

    return {
      matchId,
      queue: queueName(queueId),
      mapName: map.name,
      mapIcon: map.icon,
      startedAt: (info['gameStartMillis'] as number) ?? 0,
      lengthMs: (info['gameLengthMillis'] as number) ?? 0,
      agentName: agent?.name ?? null,
      agentIcon: agent?.icon ?? null,
      kills: stats['kills'] ?? 0,
      deaths: stats['deaths'] ?? 0,
      assists: stats['assists'] ?? 0,
      score: stats['score'] ?? 0,
      won,
      roundsWon,
      roundsLost,
      rrDelta: rrByMatch.get(matchId) ?? null
    }
  }

  // ------------------------------------------------------------- profile ----

  async getProfile(): Promise<ProfileData | { error: string }> {
    if (!this.remote || !this.tokens) {
      return { error: 'VALORANT no está en ejecución.' }
    }
    const puuid = this.tokens.puuid
    try {
      const presences = await this.local?.getPresences().catch(() => []) ?? []
      const self = await this.buildSelf(puuid, presences)
      const updates = await this.remote
        .getCompetitiveUpdates(puuid, 15)
        .catch(() => ({ Matches: [] }))

      const parsed: CompUpdate[] = (updates.Matches ?? []).map((m) => {
        const t = this.statics.tier(m.TierAfterUpdate)
        const map = this.statics.map(m.MapID)
        return {
          matchId: m.MatchID,
          startedAt: m.MatchStartTime,
          tierAfter: m.TierAfterUpdate,
          tierName: t.name,
          tierIcon: t.icon,
          rrAfter: m.RankedRatingAfterUpdate,
          delta: m.RankedRatingEarned,
          mapName: map.name
        }
      })

      return { self, updates: parsed }
    } catch (e) {
      return { error: (e as Error).message }
    }
  }
}
