import { useEffect, useState } from 'react'
import type { Snapshot } from '../../../shared/types'

const INITIAL: Snapshot = {
  state: 'offline',
  updatedAt: 0,
  self: null,
  live: null,
  menus: null,
  error: null,
  region: null
}

/** Se suscribe al estado del tracker que emite el proceso principal. */
export function useTracker(): Snapshot {
  const [snapshot, setSnapshot] = useState<Snapshot>(INITIAL)

  useEffect(() => {
    let mounted = true
    void window.valtrack.getState().then((s) => {
      if (mounted && s) setSnapshot(s)
    })
    const unsubscribe = window.valtrack.onState((s) => {
      if (mounted) setSnapshot(s)
    })
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  return snapshot
}
