import { requestJson } from './http'
import type { Lockfile } from './lockfile'

export interface Tokens {
  accessToken: string
  entitlementToken: string
  puuid: string
}

export interface PresencePrivate {
  sessionLoopState?: string
  partyId?: string
  partySize?: number
  queueId?: string
  accountLevel?: number
  competitiveTier?: number
  playerCardId?: string
  matchMap?: string
}

export interface Presence {
  puuid: string
  game_name: string
  game_tag: string
  product: string
  private: PresencePrivate | null
}

/**
 * Riot cambió el formato del "private" de las presencias: antes era plano y
 * ahora anida los datos en playerPresenceData / partyPresenceData /
 * matchPresenceData. Normalizamos ambos formatos al esquema plano.
 */
function normalizePresencePrivate(raw: Record<string, unknown>): PresencePrivate {
  const player = (raw['playerPresenceData'] as Record<string, unknown>) ?? {}
  const party = (raw['partyPresenceData'] as Record<string, unknown>) ?? {}
  const match = (raw['matchPresenceData'] as Record<string, unknown>) ?? {}
  const pick = <T>(...values: unknown[]): T | undefined =>
    values.find((v) => v !== undefined && v !== null && v !== '') as T | undefined
  return {
    sessionLoopState: pick<string>(match['sessionLoopState'], raw['sessionLoopState']),
    partyId: pick<string>(raw['partyId'], party['partyId']),
    partySize: pick<number>(raw['partySize'], party['partySize']),
    queueId: pick<string>(raw['queueId'], match['queueId']),
    accountLevel: pick<number>(player['accountLevel'], raw['accountLevel']),
    competitiveTier: pick<number>(player['competitiveTier'], raw['competitiveTier']),
    playerCardId: pick<string>(player['playerCardId'], raw['playerCardId']),
    matchMap: pick<string>(match['matchMap'], raw['matchMap'])
  }
}

/** Cliente de la API local del Riot Client (127.0.0.1:puerto, auth básica). */
export class LocalClient {
  private base: string
  private authHeader: string

  constructor(lockfile: Lockfile) {
    this.base = `https://127.0.0.1:${lockfile.port}`
    this.authHeader =
      'Basic ' + Buffer.from(`riot:${lockfile.password}`).toString('base64')
  }

  private get<T>(path: string): Promise<T> {
    return requestJson<T>(this.base + path, {
      insecure: true,
      timeoutMs: 5000,
      headers: { Authorization: this.authHeader }
    })
  }

  /** Tokens de sesión (access + entitlement) para llamar a los servidores de Riot. */
  async getTokens(): Promise<Tokens> {
    const r = await this.get<{
      accessToken: string
      token: string
      subject: string
    }>('/entitlements/v1/token')
    return { accessToken: r.accessToken, entitlementToken: r.token, puuid: r.subject }
  }

  /** Presencias del chat: incluye tu estado (menús / pregame / en partida) y tu party. */
  async getPresences(): Promise<Presence[]> {
    const r = await this.get<{ presences: Array<Record<string, unknown>> }>(
      '/chat/v4/presences'
    )
    return (r.presences ?? [])
      .filter((p) => p['product'] === 'valorant')
      .map((p) => {
        let priv: PresencePrivate | null = null
        try {
          const raw = p['private']
          if (typeof raw === 'string' && raw.length > 0) {
            priv = normalizePresencePrivate(
              JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
            )
          }
        } catch {
          priv = null
        }
        return {
          puuid: String(p['puuid'] ?? ''),
          game_name: String(p['game_name'] ?? ''),
          game_tag: String(p['game_tag'] ?? ''),
          product: String(p['product'] ?? ''),
          private: priv
        }
      })
  }
}
