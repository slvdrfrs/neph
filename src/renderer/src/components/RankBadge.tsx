import type { RankInfo } from '../../../shared/types'

export function RankBadge({
  rank,
  showRR = true
}: {
  rank: RankInfo | null
  showRR?: boolean
}): JSX.Element {
  if (!rank) return <span className="rank-badge muted">—</span>
  return (
    <span className="rank-badge">
      {rank.icon && <img className="rank-icon" src={rank.icon} alt="" />}
      <span className="rank-name">{rank.name}</span>
      {showRR && rank.tier > 0 && <span className="rank-rr">{rank.rr} RR</span>}
    </span>
  )
}
