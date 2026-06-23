// Helpers to bridge ISO timestamptz (stored, UTC) <-> <input type="datetime-local">
// values, which represent local wall-clock time with no zone.

const pad = (n: number) => String(n).padStart(2, '0')

export function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`
}

export function localInputToIso(local: string): string | null {
  if (!local) return null
  const d = new Date(local) // parsed as local time
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/** kickoff minus N minutes, as an ISO string (or null if no kickoff). */
export function defaultLockIso(kickoffIso: string | null, minutesBefore: number): string | null {
  if (!kickoffIso) return null
  return new Date(new Date(kickoffIso).getTime() - minutesBefore * 60000).toISOString()
}
