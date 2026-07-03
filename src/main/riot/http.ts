import https from 'node:https'

export interface RequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: unknown
  /** Permite certificados autofirmados (necesario para la API local de Riot en 127.0.0.1) */
  insecure?: boolean
  timeoutMs?: number
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    public bodyText: string
  ) {
    super(`HTTP ${status} en ${url}`)
  }
}

/** Petición HTTPS que devuelve JSON. Sin dependencias externas. */
export function requestJson<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const data = opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: opts.method ?? 'GET',
        rejectUnauthorized: !opts.insecure,
        timeout: opts.timeoutMs ?? 15000,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': String(Buffer.byteLength(data)) } : {}),
          ...opts.headers
        }
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          const status = res.statusCode ?? 0
          if (status >= 400) {
            reject(new HttpError(status, url, text.slice(0, 300)))
            return
          }
          if (!text) {
            resolve(undefined as T)
            return
          }
          try {
            resolve(JSON.parse(text) as T)
          } catch (e) {
            reject(new Error(`Respuesta no válida de ${url}: ${(e as Error).message}`))
          }
        })
      }
    )
    req.on('timeout', () => req.destroy(new Error(`Timeout en ${url}`)))
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}
