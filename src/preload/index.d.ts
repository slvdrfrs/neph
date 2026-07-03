import type { TrackerApi } from '../shared/types'

declare global {
  interface Window {
    valtrack: TrackerApi
  }
}

export {}
