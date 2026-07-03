import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface Lockfile {
  name: string
  pid: number
  port: number
  password: string
  protocol: string
}

/**
 * Lee el lockfile del Riot Client. Existe solo mientras el cliente está abierto
 * y contiene el puerto y la contraseña de la API local.
 */
export async function readLockfile(): Promise<Lockfile | null> {
  const local = process.env.LOCALAPPDATA
  if (!local) return null
  try {
    const raw = await readFile(
      join(local, 'Riot Games', 'Riot Client', 'Config', 'lockfile'),
      'utf8'
    )
    const [name, pid, port, password, protocol] = raw.trim().split(':')
    if (!port || !password) return null
    return { name, pid: Number(pid), port: Number(port), password, protocol }
  } catch {
    return null
  }
}
