import { readLockfile } from './lockfile'
import { detectRegion, detectClientVersion, type RegionInfo } from './region'
import { LocalClient, type Presence, type Tokens } from './localClient'
import {
  RemoteClient,
  type MMRResponse,
  type PlayerIdentity
} from './remoteClient'
import { StaticData, queueName } from './staticData'
import { sleep } from './http'
import type {
  Snapshot,
  LivePlayer,
  LiveMatch,
  LiveStats,
  LastMeeting,
  RankInfo,
  SelfInfo,
  PartyMember,
  HistoryItem,
  Scoreboard,
  ScoreboardPlayer,
  ScoreboardTeam,
  ProfileData,
  CompUpdate
} from '../../shared/types'

const POLL_MS = 5000
/** El rango no cambia durante una partida; se limpia al volver a los menús */
const MMR_CACHE_MS = 600_000
/** La forma de un jugador tampoco cambia mientras juega contigo */
const STATS_TTL_MS = 1_800_000
/** Espaciado entre peticiones de stats: ~65/min como máximo absoluto */
const STATS_GAP_MS = 900
/** Espaciado penalizado tras un 429 reciente */
const STATS_GAP_SLOW_MS = 2200
/** Partidas analizadas por jugador para KD/HS/ADR */
const STATS_MATCHES = 3
/** Modos válidos para calcular KD/HS/ADR (fuera deathmatch y modos raros) */
const STAT_QUEUES = new Set(['competitive', 'unrated', 'swiftplay', 'premier'])

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

interface MatchPlayerStats {
  kills: number
  deaths: number
  rounds: number
  damage: number
  headshots: number
  totalShots: number
}

/** Extrae kills/deaths, daño y precisión de un jugador desde los detalles de partida. */
function parseMatchStats(
  details: Record<string, unknown>,
  puuid: string
): MatchPlayerStats | null {
  const players = (details['players'] as Array<Record<string, unknown>>) ?? []
  const me = players.find((p) => p['subject'] === puuid)
  if (!me) return null
  const stats = (me['stats'] as Record<string, number>) ?? {}

  let damage = 0
  let headshots = 0
  let totalShots = 0
  const rounds = (details['roundResults'] as Array<Record<string, unknown>>) ?? []
  for (const round of rounds) {
    const playerStats = (round['playerStats'] as Array<Record<string, unknown>>) ?? []
    const mine = playerStats.find((p) => p['subject'] === puuid)
    if (!mine) continue
    for (const d of (mine['damage'] as Array<Record<string, number>>) ?? []) {
      damage += d['damage'] ?? 0
      headshots += d['headshots'] ?? 0
      totalShots += (d['headshots'] ?? 0) + (d['bodyshots'] ?? 0) + (d['legshots'] ?? 0)
    }
  }

  return {
    kills: stats['kills'] ?? 0,
    deaths: stats['deaths'] ?? 0,
    rounds: rounds.length || (stats['roundsPlayed'] ?? 0),
    damage,
    headshots,
    totalShots
  }
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

  private wrCache = new Map<string, { at: number; winrate: number | null; games: number }>()
  private formCache = new Map<
    string,
    { at: number; kd: number | null; hsPct: number | null; adr: number | null; games: number }
  >()
  private statsInFlight = new Set<string>()
  private statsChain: Promise<unknown> = Promise.resolve()

  /** puuid → último cruce en tus partidas recientes */
  private encounters = new Map<string, LastMeeting>()
  private encountersAt = 0
  private encountersLoading = false

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

    // La presencia local (gratis) dice en qué estado estás: solo se consulta a
    // los servidores de Riot cuando indica partida o cuando no hay presencia.
    const loop = selfPresence?.private?.sessionLoopState ?? null

    let coreMatchId: string | null = null
    let pregameId: string | null = null
    if (loop === 'PREGAME') {
      pregameId = await this.remote.getPregameMatchId(puuid).catch(() => null)
      if (!pregameId) {
        coreMatchId = await this.remote.getCoreGameMatchId(puuid).catch(() => null)
      }
    } else if (loop === 'INGAME' || loop === null) {
      coreMatchId = await this.remote.getCoreGameMatchId(puuid).catch(() => null)
      if (!coreMatchId) {
        pregameId = await this.remote.getPregameMatchId(puuid).catch(() => null)
      }
    }
    // loop === 'MENUS': cero llamadas a glz

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

    // En menús. Si venimos de una partida, los rangos y los cruces cambiaron:
    // se invalidan para refrescarlos con los datos post-partida.
    if (this.snapshot.state === 'ingame') {
      this.mmrCache.clear()
      this.encountersAt = 0
    }
    this.lastMatchId = null
    this.lastLive = null
    const self = await this.buildSelf(puuid, presences)
    this.snapshot = {
      state: 'menus',
      updatedAt: Date.now(),
      self,
      live: null,
      menus: {
        queueName: selfPresence?.private?.queueId != null
          ? queueName(selfPresence.private.queueId)
          : null,
        partySize: selfPresence?.private?.partySize ?? null,
        members: await this.buildParty(puuid, presences, selfPresence)
      },
      error: null,
      region: this.regionInfo.region
    }
  }

  /**
   * Miembros de tu grupo en el lobby. Usa el servicio de parties (incluye a
   * los que no son tus amigos, que el chat no expone); las presencias quedan
   * como respaldo si falla.
   */
  private async buildParty(
    selfPuuid: string,
    presences: Presence[],
    selfPresence: Presence | null
  ): Promise<PartyMember[]> {
    try {
      const partyId = await this.remote!.getPartyId(selfPuuid)
      if (!partyId) throw new Error('sin party')
      const party = await this.remote!.getParty(partyId)
      const raw = party.Members ?? []
      if (raw.length === 0) throw new Error('party vacía')

      const names = await this.resolveNames(raw.map((m) => m.Subject))
      const members = await Promise.all(
        raw.map(async (m): Promise<PartyMember> => {
          let card: string | null = null
          const cardId = m.PlayerIdentity?.PlayerCardID
          if (cardId) {
            card = await this.statics
              .playerCard(cardId)
              .then((c) => c.large)
              .catch(() => null)
          }
          const r = await this.getRank(m.Subject)
          const n = names.get(m.Subject)
          return {
            puuid: m.Subject,
            name: n?.name || 'Jugador',
            tag: n?.tag ?? '',
            level: m.PlayerIdentity?.AccountLevel ?? null,
            rank: r.rank.tier > 0 ? r.rank : null,
            card,
            isSelf: m.Subject === selfPuuid
          }
        })
      )
      return members.sort((a, b) => Number(b.isSelf) - Number(a.isSelf))
    } catch {
      return this.buildPartyFromPresences(selfPuuid, presences, selfPresence)
    }
  }

  /** Respaldo: party desde las presencias del chat (solo amigos visibles). */
  private async buildPartyFromPresences(
    selfPuuid: string,
    presences: Presence[],
    selfPresence: Presence | null
  ): Promise<PartyMember[]> {
    const partyId = selfPresence?.private?.partyId
    if (!partyId) return []
    const partyPres = presences.filter((p) => p.private?.partyId === partyId)

    const members = await Promise.all(
      partyPres.map(async (p): Promise<PartyMember> => {
        let card: string | null = null
        const cardId = p.private?.playerCardId
        if (cardId) {
          card = await this.statics
            .playerCard(cardId)
            .then((c) => c.large)
            .catch(() => null)
        }
        const tierNum = p.private?.competitiveTier ?? 0
        let rank: RankInfo | null = null
        if (tierNum > 0) {
          const t = this.statics.tier(tierNum)
          rank = { tier: tierNum, name: t.name, icon: t.icon, rr: 0 }
        }
        return {
          puuid: p.puuid,
          name: p.game_name,
          tag: p.game_tag,
          level: p.private?.accountLevel ?? null,
          rank,
          card,
          isSelf: p.puuid === selfPuuid
        }
      })
    )
    return members.sort((a, b) => Number(b.isSelf) - Number(a.isSelf))
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

  // --------------------------------------------------------- stats en vivo --

  /**
   * Cola serializada con espaciado fijo: todas las peticiones de stats pasan
   * por aquí para no exceder el rate limit de Riot (~60/min).
   */
  private enqueueStats<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.statsChain.then(async () => {
      const result = await fn()
      // Si Riot nos frenó hace poco, baja el ritmo temporalmente
      const penalized =
        this.remote !== null && Date.now() - this.remote.last429At < 60_000
      await sleep(penalized ? STATS_GAP_SLOW_MS : STATS_GAP_MS)
      return result
    })
    this.statsChain = run.catch(() => undefined)
    return run
  }

  /** Forma actual de un jugador a partir de las cachés. */
  private liveStatsFor(puuid: string): LiveStats {
    const now = Date.now()
    const wr = this.wrCache.get(puuid)
    const form = this.formCache.get(puuid)
    const wrFresh = wr !== undefined && now - wr.at < STATS_TTL_MS
    const formFresh = form !== undefined && now - form.at < STATS_TTL_MS
    return {
      winrate: wrFresh ? wr.winrate : null,
      wrGames: wrFresh ? wr.games : 0,
      kd: formFresh ? form.kd : null,
      hsPct: formFresh ? form.hsPct : null,
      adr: formFresh ? form.adr : null,
      statsGames: formFresh ? form.games : 0,
      loading: !wrFresh || !formFresh
    }
  }

  /** Actualiza las stats de un jugador en el snapshot actual y notifica a la UI. */
  private pushLiveStats(puuid: string): void {
    const live = this.snapshot.live
    if (!live) return
    const player = live.players.find((p) => p.puuid === puuid)
    if (!player) return
    player.stats = this.liveStatsFor(puuid)
    this.onUpdate?.(this.snapshot)
  }

  /** Lanza en segundo plano la descarga de stats de los jugadores que falten. */
  private scheduleStats(puuids: string[]): void {
    const now = Date.now()
    for (const puuid of puuids) {
      const wr = this.wrCache.get(puuid)
      const form = this.formCache.get(puuid)
      const wrFresh = wr !== undefined && now - wr.at < STATS_TTL_MS
      const formFresh = form !== undefined && now - form.at < STATS_TTL_MS
      if ((wrFresh && formFresh) || this.statsInFlight.has(puuid)) continue
      this.statsInFlight.add(puuid)
      void this.hydratePlayerStats(puuid, !wrFresh, !formFresh)
    }
  }

  private async hydratePlayerStats(
    puuid: string,
    needWr: boolean,
    needForm: boolean
  ): Promise<void> {
    try {
      if (needWr) {
        const updates = await this.enqueueStats(() =>
          this.remote!.getCompetitiveUpdates(puuid, 20)
        )
        let wins = 0
        let losses = 0
        for (const m of updates.Matches ?? []) {
          if (m.RankedRatingEarned > 0) wins++
          else if (m.RankedRatingEarned < 0) losses++
        }
        const games = wins + losses
        this.wrCache.set(puuid, {
          at: Date.now(),
          winrate: games > 0 ? Math.round((wins / games) * 100) : null,
          games
        })
        this.pushLiveStats(puuid)
      }

      if (needForm) {
        const history = await this.enqueueStats(() =>
          this.remote!.getMatchHistory(puuid, 0, 15)
        )
        const entries = (history.History ?? [])
          .filter((e) => STAT_QUEUES.has(e.QueueID))
          .slice(0, STATS_MATCHES)

        const agg = { kills: 0, deaths: 0, rounds: 0, dmg: 0, hs: 0, shots: 0, games: 0 }
        for (const entry of entries) {
          let details = this.detailsCache.get(entry.MatchID)
          if (!details) {
            details = await this.enqueueStats(() =>
              this.remote!.getMatchDetails(entry.MatchID)
            )
            this.detailsCache.set(entry.MatchID, details)
            this.trimDetailsCache()
          }
          const s = parseMatchStats(details, puuid)
          if (!s) continue
          agg.kills += s.kills
          agg.deaths += s.deaths
          agg.rounds += s.rounds
          agg.dmg += s.damage
          agg.hs += s.headshots
          agg.shots += s.totalShots
          agg.games++
        }

        this.formCache.set(puuid, {
          at: Date.now(),
          kd:
            agg.games > 0
              ? Math.round((agg.kills / Math.max(agg.deaths, 1)) * 100) / 100
              : null,
          hsPct: agg.shots > 0 ? Math.round((agg.hs / agg.shots) * 100) : null,
          adr: agg.rounds > 0 ? Math.round(agg.dmg / agg.rounds) : null,
          games: agg.games
        })
      }
    } catch {
      // Falló (p. ej. rate limit persistente): conserva lo que hubiera y
      // marca la entrada para reintentar en ~45 s, no en 10 min
      if (this.remote) {
        const retryAt = Date.now() - STATS_TTL_MS + 45_000
        if (needWr) {
          const prev = this.wrCache.get(puuid)
          this.wrCache.set(puuid, {
            at: retryAt,
            winrate: prev?.winrate ?? null,
            games: prev?.games ?? 0
          })
        }
        if (needForm) {
          const prev = this.formCache.get(puuid)
          this.formCache.set(puuid, {
            at: retryAt,
            kd: prev?.kd ?? null,
            hsPct: prev?.hsPct ?? null,
            adr: prev?.adr ?? null,
            games: prev?.games ?? 0
          })
        }
      }
    } finally {
      this.statsInFlight.delete(puuid)
      this.pushLiveStats(puuid)
    }
  }

  /** Reconstruye el índice de jugadores vistos en tus últimas 15 partidas. */
  private scheduleEncounters(selfPuuid: string): void {
    if (this.encountersLoading || Date.now() - this.encountersAt < STATS_TTL_MS) return
    this.encountersLoading = true
    void this.hydrateEncounters(selfPuuid)
  }

  private async hydrateEncounters(selfPuuid: string): Promise<void> {
    try {
      const history = await this.enqueueStats(() =>
        this.remote!.getMatchHistory(selfPuuid, 0, 15)
      )
      const fresh = new Map<string, LastMeeting>()
      for (const entry of history.History ?? []) {
        let details = this.detailsCache.get(entry.MatchID)
        if (!details) {
          details = await this.enqueueStats(() =>
            this.remote!.getMatchDetails(entry.MatchID)
          )
          this.detailsCache.set(entry.MatchID, details)
          this.trimDetailsCache()
        }
        const info = details['matchInfo'] as Record<string, unknown> | undefined
        const players = (details['players'] as Array<Record<string, unknown>>) ?? []
        const teams = (details['teams'] as Array<Record<string, unknown>>) ?? []
        const me = players.find((p) => p['subject'] === selfPuuid)
        if (!me || !info) continue
        const myTeam = me['teamId'] as string
        const isDm = (info['queueID'] as string) === 'deathmatch'
        const myWon = isDm
          ? null
          : ((teams.find((t) => t['teamId'] === myTeam)?.['won'] as boolean) ?? null)
        const startedAt = (info['gameStartMillis'] as number) ?? 0
        for (const p of players) {
          const sub = p['subject'] as string
          // El historial viene del más reciente al más antiguo: nos quedamos
          // con el primer cruce que aparezca (el último en el tiempo)
          if (sub === selfPuuid || fresh.has(sub)) continue
          fresh.set(sub, {
            enemy: isDm ? true : (p['teamId'] as string) !== myTeam,
            startedAt,
            won: myWon
          })
        }
      }
      this.encounters = fresh
      this.encountersAt = Date.now()

      // Refresca la partida en vivo si la hay
      const live = this.snapshot.live
      if (live) {
        for (const p of live.players) {
          if (!p.isSelf) p.lastMeeting = this.encounters.get(p.puuid) ?? null
        }
        this.onUpdate?.(this.snapshot)
      }
    } catch {
      // Se reintentará en el próximo ciclo
    } finally {
      this.encountersLoading = false
    }
  }

  /** Evita que la caché de detalles crezca sin límite (son objetos grandes). */
  private trimDetailsCache(): void {
    if (this.detailsCache.size <= 300) return
    const oldest = this.detailsCache.keys().next().value
    if (oldest !== undefined) this.detailsCache.delete(oldest)
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
    // Concurrencia moderada: una ráfaga fuerte aquí provoca 429 en cadena
    const ranks = await pool(puuids, 3, (p) => this.getRank(p))
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
        isSelf: e.puuid === selfPuuid,
        stats: this.liveStatsFor(e.puuid),
        lastMeeting:
          e.puuid === selfPuuid ? null : this.encounters.get(e.puuid) ?? null
      }
    })
  }

  private async buildCoreGame(
    matchId: string,
    selfPuuid: string,
    presences: Presence[]
  ): Promise<LiveMatch> {
    // Reutiliza los datos si es la misma partida y son recientes (<30 s),
    // pero sigue reprogramando stats pendientes (reintentos tras un fallo)
    if (
      this.lastMatchId === matchId &&
      this.lastLive &&
      Date.now() - this.snapshot.updatedAt < 30_000 &&
      this.snapshot.state === 'ingame'
    ) {
      this.scheduleStats(
        [...this.lastLive.players]
          .sort((a, b) => Number(b.enemy) - Number(a.enemy))
          .map((p) => p.puuid)
      )
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
    // Los enemigos primero: su información es la que importa
    this.scheduleStats(
      [...players].sort((a, b) => Number(b.enemy) - Number(a.enemy)).map((p) => p.puuid)
    )
    this.scheduleEncounters(selfPuuid)
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

    const live: LiveMatch = {
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
    this.scheduleStats(
      [...players].sort((a, b) => Number(b.enemy) - Number(a.enemy)).map((p) => p.puuid)
    )
    this.scheduleEncounters(selfPuuid)
    return live
  }

  // ------------------------------------------------------------- history ----

  async getHistory(start = 0): Promise<HistoryItem[] | { error: string }> {
    if (!this.remote || !this.tokens) {
      return { error: 'VALORANT no está en ejecución.' }
    }
    const puuid = this.tokens.puuid
    try {
      const [history, updates] = await Promise.all([
        this.remote.getMatchHistory(puuid, start, start + 12),
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

    const ms = parseMatchStats(details, puuid)

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
      rrDelta: rrByMatch.get(matchId) ?? null,
      hsPct:
        ms && ms.totalShots > 0 ? Math.round((ms.headshots / ms.totalShots) * 100) : null,
      adr: ms && ms.rounds > 0 ? Math.round(ms.damage / ms.rounds) : null
    }
  }

  /** Scoreboard completo de una partida (los 10 jugadores con sus stats). */
  async getScoreboard(matchId: string): Promise<Scoreboard | { error: string }> {
    if (!this.remote || !this.tokens) {
      return { error: 'VALORANT no está en ejecución.' }
    }
    try {
      let details = this.detailsCache.get(matchId)
      if (!details) {
        details = await this.remote.getMatchDetails(matchId)
        this.detailsCache.set(matchId, details)
        this.trimDetailsCache()
      }
      const playersRaw = (details['players'] as Array<Record<string, unknown>>) ?? []
      const teamsRaw = (details['teams'] as Array<Record<string, unknown>>) ?? []

      const teams: ScoreboardTeam[] = teamsRaw
        .map((t) => ({
          teamId: t['teamId'] as string,
          won: (t['won'] as boolean) ?? false,
          roundsWon: (t['roundsWon'] as number) ?? 0
        }))
        .sort((a, b) => Number(b.won) - Number(a.won))

      // Los detalles ya no traen los nombres: se resuelven con el name-service
      const names = await this.resolveNames(
        playersRaw.map((p) => p['subject'] as string)
      )

      // Primeras sangres: la kill más temprana de cada ronda
      const fbCount = new Map<string, number>()
      for (const round of (details['roundResults'] as Array<Record<string, unknown>>) ??
        []) {
        let bestTime = Infinity
        let bestKiller: string | null = null
        for (const ps of (round['playerStats'] as Array<Record<string, unknown>>) ?? []) {
          for (const k of (ps['kills'] as Array<Record<string, unknown>>) ?? []) {
            const t =
              (k['roundTime'] as number) ??
              (k['timeSinceRoundStartMillis'] as number) ??
              (k['gameTime'] as number) ??
              Infinity
            if (t < bestTime) {
              bestTime = t
              bestKiller = (k['killer'] as string) ?? (ps['subject'] as string)
            }
          }
        }
        if (bestKiller) fbCount.set(bestKiller, (fbCount.get(bestKiller) ?? 0) + 1)
      }

      const selfPuuid = this.tokens.puuid
      const players: ScoreboardPlayer[] = playersRaw
        .map((p) => {
          const puuid = p['subject'] as string
          const stats = (p['stats'] as Record<string, number>) ?? {}
          const ms = parseMatchStats(details!, puuid)
          const agent = this.statics.agent(p['characterId'] as string)
          const tierNum = (p['competitiveTier'] as number) ?? 0
          const tier = tierNum > 0 ? this.statics.tier(tierNum) : null
          const rounds = ms?.rounds ?? stats['roundsPlayed'] ?? 0
          const n = names.get(puuid)
          return {
            puuid,
            name: n?.name || (p['gameName'] as string) || agent?.name || 'Jugador',
            tag: n?.tag || ((p['tagLine'] as string) ?? ''),
            agentName: agent?.name ?? null,
            agentIcon: agent?.icon ?? null,
            teamId: p['teamId'] as string,
            tierName: tier?.name ?? null,
            tierIcon: tier?.icon ?? null,
            acs: rounds > 0 ? Math.round((stats['score'] ?? 0) / rounds) : 0,
            kills: stats['kills'] ?? 0,
            deaths: stats['deaths'] ?? 0,
            assists: stats['assists'] ?? 0,
            hsPct:
              ms && ms.totalShots > 0
                ? Math.round((ms.headshots / ms.totalShots) * 100)
                : null,
            adr: ms && ms.rounds > 0 ? Math.round(ms.damage / ms.rounds) : null,
            fb: fbCount.get(puuid) ?? 0,
            mvp: null as ScoreboardPlayer['mvp'],
            isSelf: puuid === selfPuuid
          }
        })
        .sort((a, b) => b.acs - a.acs)

      // MVP de la partida (mejor ACS del equipo ganador) y del equipo perdedor
      const winTeamId = teams.find((t) => t.won)?.teamId ?? null
      const matchMvp = winTeamId
        ? players.find((p) => p.teamId === winTeamId)
        : players[0]
      if (matchMvp) matchMvp.mvp = 'match'
      if (winTeamId) {
        const teamMvp = players.find((p) => p.teamId !== winTeamId)
        if (teamMvp) teamMvp.mvp = 'team'
      }

      return { matchId, teams, players }
    } catch (e) {
      return { error: (e as Error).message }
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
