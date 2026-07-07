import type { Match, RoundCode } from './types'
import { getLang } from './i18n'

export const ROUND_NAMES: Record<RoundCode, string> = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-finals',
  SF: 'Semi-finals',
  TP: 'Third-place play-off',
  F: 'Final',
}

export const ROUND_NAMES_ES: Record<RoundCode, string> = {
  R32: 'Dieciseisavos',
  R16: 'Octavos de final',
  QF: 'Cuartos de final',
  SF: 'Semifinales',
  TP: 'Tercer puesto',
  F: 'Final',
}

/** Round name in the active language. */
export function roundName(code: RoundCode): string {
  return getLang() === 'es' ? ROUND_NAMES_ES[code] : ROUND_NAMES[code]
}

export const ROUND_ORDER: RoundCode[] = ['R32', 'R16', 'QF', 'SF', 'TP', 'F']

function dateLocale(): string {
  return getLang() === 'es' ? 'es' : 'en-GB'
}

export function formatKickoff(iso: string | null): string {
  if (!iso) return getLang() === 'es' ? 'Hora por definir' : 'Time TBD'
  return new Date(iso).toLocaleString(dateLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

/** Just the kick-off time in the viewer's zone, e.g. "21:00 CET" (the day is a
 * section header). The short zone label is whatever the device reports. */
export function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString(dateLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

/** A day heading, e.g. "Sunday, 28 June" / "domingo, 28 de junio". */
export function formatDay(iso: string | null): string {
  if (!iso) return getLang() === 'es' ? 'Fecha por definir' : 'Date TBD'
  return new Date(iso).toLocaleDateString(dateLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

/** Compact date for tight spots, e.g. "3 Jul" / "3 jul". Empty when undated. */
export function formatShortDay(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })
}

export function formatLock(iso: string | null): string {
  if (!iso) return getLang() === 'es' ? 'Sin hora de cierre' : 'No lock time set'
  return new Date(iso).toLocaleString(dateLocale(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

export function matchTitle(m: Match): string {
  const no = m.match_no ? `#${m.match_no} · ` : ''
  return `${no}${m.home_team} vs ${m.away_team}`
}

/** Human countdown to lock, e.g. "2d 4h", "35m", or "Locked". */
export function timeUntilLock(iso: string | null): string {
  const locked = getLang() === 'es' ? 'Cerrado' : 'Locked'
  if (!iso) return locked
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return locked
  const mins = Math.floor(ms / 60000)
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${m}m`
  return `${m}m`
}
