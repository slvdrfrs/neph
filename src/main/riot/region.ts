import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface RegionInfo {
  region: string
  shard: string
}

async function readShooterLog(): Promise<string | null> {
  const local = process.env.LOCALAPPDATA
  if (!local) return null
  try {
    return await readFile(
      join(local, 'VALORANT', 'Saved', 'Logs', 'ShooterGame.log'),
      'utf8'
    )
  } catch {
    return null
  }
}

/**
 * Detecta región y shard leyendo el log de VALORANT (ShooterGame.log),
 * que contiene URLs del tipo https://glz-<region>-1.<shard>.a.pvp.net
 */
export async function detectRegion(): Promise<RegionInfo | null> {
  const log = await readShooterLog()
  const m = log?.match(/https:\/\/glz-([a-z]+)-1\.([a-z]+)\.a\.pvp\.net/)
  return m ? { region: m[1], shard: m[2] } : null
}

/**
 * Versión real del cliente desde el log ("CI server version: release-...").
 * Es más fiable que valorant-api.com, que puede ir una build por detrás y
 * hacer que los servidores respondan 404 (UNKNOWN_CONTENT_VERSION).
 */
export async function detectClientVersion(): Promise<string | null> {
  const log = await readShooterLog()
  const m = log?.match(/CI server version: (.+)/)
  return m ? m[1].trim() : null
}
