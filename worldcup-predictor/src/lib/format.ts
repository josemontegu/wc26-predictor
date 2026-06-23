import type { Match, RoundCode } from './types'

export const ROUND_NAMES: Record<RoundCode, string> = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-finals',
  SF: 'Semi-finals',
  TP: 'Third-place play-off',
  F: 'Final',
}

export const ROUND_ORDER: RoundCode[] = ['R32', 'R16', 'QF', 'SF', 'TP', 'F']

export function formatKickoff(iso: string | null): string {
  if (!iso) return 'Time TBD'
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatLock(iso: string | null): string {
  if (!iso) return 'No lock time set'
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function matchTitle(m: Match): string {
  const no = m.match_no ? `#${m.match_no} · ` : ''
  return `${no}${m.home_team} vs ${m.away_team}`
}

/** Human countdown to lock, e.g. "2d 4h", "35m", or "Locked". */
export function timeUntilLock(iso: string | null): string {
  if (!iso) return 'Locked'
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'Locked'
  const mins = Math.floor(ms / 60000)
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${m}m`
  return `${m}m`
}
