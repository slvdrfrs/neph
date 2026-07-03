import { type PlayerProfile, type ProfileMatch, rankGroup } from './types'

/**
 * Capa de datos sobre la API de HenrikDev (https://docs.henrikdev.xyz).
 * Sin HENRIK_API_KEY en el entorno, devuelve datos de demostración para que
 * la web funcione completa durante el desarrollo.
 *
 * Fase 2 (Supabase): estas funciones pasarán a escribir en la base de datos
 * y las páginas leerán de ahí; Henrik solo rellenará/refrescará.
 */

const BASE = 'https://api.henrikdev.xyz'
const KEY = process.env.HENRIK_API_KEY

export const henrikConfigured = Boolean(KEY && KEY.length > 0)

async function henrik<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: KEY ?? '' },
    // Caché de Next: evita repetir la misma petición durante 2 minutos
    next: { revalidate: 120 }
  })
  if (!res.ok) {
    throw new Error(`Henrik ${res.status} en ${path}`)
  }
  const body = (await res.json()) as { data: T }
  return body.data
}

export async function getPlayerProfile(
  name: string,
  tag: string
): Promise<PlayerProfile | null> {
  if (!henrikConfigured) return demoProfile(name, tag)

  try {
    const account = await henrik<{
      region: string
      account_level: number
    }>(`/valorant/v2/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`)

    const region = account.region

    const [mmr, matches] = await Promise.all([
      henrik<{
        current_data?: {
          currenttierpatched?: string
          ranking_in_tier?: number
        }
        highest_rank?: { patched_tier?: string }
      }>(`/valorant/v2/mmr/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`),
      henrik<
        Array<{
          metadata: { matchid: string; map: string; mode: string; game_start_patched: string }
          players: {
            all_players: Array<{
              name: string
              tag: string
              team: string
              character: string
              stats: { kills: number; deaths: number; assists: number }
            }>
          }
          teams: Record<string, { has_won?: boolean }>
        }>
      >(`/valorant/v3/matches/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?size=10`)
    ])

    const rankName = mmr.current_data?.currenttierpatched ?? 'Unrated'
    const peakName = mmr.highest_rank?.patched_tier ?? null

    const parsedMatches: ProfileMatch[] = matches.map((m) => {
      const me = m.players.all_players.find(
        (p) => p.name.toLowerCase() === name.toLowerCase() && p.tag.toLowerCase() === tag.toLowerCase()
      )
      const team = me?.team?.toLowerCase()
      const won = team && m.teams[team] ? (m.teams[team].has_won ?? null) : null
      return {
        id: m.metadata.matchid,
        map: m.metadata.map,
        mode: m.metadata.mode,
        agent: me?.character ?? '—',
        kills: me?.stats.kills ?? 0,
        deaths: me?.stats.deaths ?? 0,
        assists: me?.stats.assists ?? 0,
        won,
        rrDelta: null,
        startedAt: m.metadata.game_start_patched
      }
    })

    const decided = parsedMatches.filter((m) => m.won !== null)
    const wins = decided.filter((m) => m.won).length
    const kills = parsedMatches.reduce((a, m) => a + m.kills, 0)
    const deaths = parsedMatches.reduce((a, m) => a + m.deaths, 0)

    return {
      name,
      tag,
      region: region.toUpperCase(),
      level: account.account_level,
      rank: {
        name: rankName,
        group: rankGroup(rankName),
        rr: mmr.current_data?.ranking_in_tier ?? 0
      },
      peak: peakName ? { name: peakName, group: rankGroup(peakName), rr: 0 } : null,
      winrate: decided.length > 0 ? Math.round((wins / decided.length) * 100) : null,
      kd: deaths > 0 ? Math.round((kills / deaths) * 100) / 100 : null,
      matches: parsedMatches,
      updatedAt: new Date().toISOString(),
      demo: false
    }
  } catch {
    return null
  }
}

// ------------------------------------------------------------------- demo --

function demoProfile(name: string, tag: string): PlayerProfile {
  const maps = ['Ascent', 'Split', 'Haven', 'Bind', 'Lotus', 'Sunset']
  const agents = ['Omen', 'Jett', 'Reyna', 'Sova', 'Killjoy', 'Chamber']
  const matches: ProfileMatch[] = Array.from({ length: 8 }, (_, i) => {
    const won = i % 3 !== 1
    return {
      id: `demo-${i}`,
      map: maps[i % maps.length],
      mode: 'Competitivo',
      agent: agents[i % agents.length],
      kills: 14 + ((i * 7) % 12),
      deaths: 11 + ((i * 5) % 8),
      assists: 3 + (i % 6),
      won,
      rrDelta: won ? 17 + (i % 9) : -(14 + (i % 7)),
      startedAt: `hace ${i + 2} horas`
    }
  })
  const wins = matches.filter((m) => m.won).length
  const kills = matches.reduce((a, m) => a + m.kills, 0)
  const deaths = matches.reduce((a, m) => a + m.deaths, 0)

  return {
    name,
    tag,
    region: 'LATAM',
    level: 185,
    rank: { name: 'Ascendente 1', group: 'ascendant', rr: 46 },
    peak: { name: 'Inmortal 3', group: 'immortal', rr: 0 },
    winrate: Math.round((wins / matches.length) * 100),
    kd: Math.round((kills / deaths) * 100) / 100,
    matches,
    updatedAt: new Date().toISOString(),
    demo: true
  }
}
