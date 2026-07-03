'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function SearchForm(): JSX.Element {
  const [value, setValue] = useState('')
  const router = useRouter()

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const raw = value.trim()
    if (!raw.includes('#')) return
    const hash = raw.lastIndexOf('#')
    const name = raw.slice(0, hash).trim()
    const tag = raw.slice(hash + 1).trim()
    if (!name || !tag) return
    router.push(`/player/${encodeURIComponent(name)}-${encodeURIComponent(tag)}`)
  }

  return (
    <form className="hero-search" onSubmit={submit}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Busca un jugador: Nombre#TAG"
        aria-label="Buscar jugador por Riot ID"
      />
      <button className="btn" type="submit">
        Buscar
      </button>
    </form>
  )
}
