import { useEffect, useMemo, useRef, useState } from 'react'
import type { AwardKind } from '../lib/types'
import { useT } from '../lib/i18n'
import { teamName } from '../lib/teamMeta'

interface Opt {
  value: string
  flag: string
  sub: string
}

// Module-level cache so the ~130KB squad data loads once, on demand.
type Squads = typeof import('../lib/squads')
let cache: Squads | null = null
async function loadSquads(): Promise<Squads> {
  if (!cache) cache = await import('../lib/squads')
  return cache
}

// Strip diacritics + lowercase so "vinicius junior" matches "Vinícius Júnior".
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')
function norm(s: string): string {
  return s.normalize('NFD').replace(DIACRITICS, '').toLowerCase().trim()
}

function buildOptions(m: Squads, kind: AwardKind): Opt[] {
  if (kind === 'team') {
    return m.TEAMS.map((t) => ({ value: t.name, flag: t.flag, sub: t.code }))
  }
  const players = kind === 'goalkeeper' ? m.PLAYERS.filter((p) => p.pos === 'GK') : m.PLAYERS
  return players.map((p) => ({
    value: p.name,
    flag: p.flag,
    sub: p.club ? `${p.team} · ${p.club}` : p.team,
  }))
}

export default function AwardPicker({
  kind,
  value,
  onChange,
  disabled,
}: {
  kind: AwardKind
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const t = useT()
  const [options, setOptions] = useState<Opt[]>([])
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const fieldRef = useRef<HTMLDivElement>(null)

  useEffect(() => setQuery(value), [value])

  // Flip the menu upward when there isn't room below (e.g. near the tab bar).
  function openMenu() {
    const rect = fieldRef.current?.getBoundingClientRect()
    if (rect) setDropUp(window.innerHeight - rect.bottom < 300)
    setOpen(true)
  }

  useEffect(() => {
    let active = true
    loadSquads().then((m) => {
      if (active) setOptions(buildOptions(m, kind))
    })
    return () => {
      active = false
    }
  }, [kind])

  const filtered = useMemo(() => {
    const q = norm(query)
    const list = q
      ? options.filter(
          (o) =>
            norm(o.value).includes(q) ||
            norm(teamName(o.value)).includes(q) ||
            norm(o.sub).includes(q),
        )
      : options
    return list.slice(0, 40)
  }, [options, query])

  const selectedFlag = useMemo(() => {
    const q = norm(query)
    return options.find((o) => norm(o.value) === q)?.flag ?? null
  }, [options, query])

  const placeholder =
    kind === 'team'
      ? t('Search teams…', 'Buscar equipos…')
      : kind === 'goalkeeper'
        ? t('Search goalkeepers…', 'Buscar arqueros…')
        : t('Search players…', 'Buscar jugadores…')

  return (
    <div className="picker">
      <div className={`picker-field ${disabled ? 'picker-disabled' : ''}`} ref={fieldRef}>
        <span className="picker-chip">{selectedFlag ?? (disabled ? '🏳️' : '🔎')}</span>
        <input
          type="text"
          value={disabled ? teamName(query) : query}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value)
            onChange(e.target.value)
            openMenu()
          }}
          onFocus={openMenu}
          onBlur={() => window.setTimeout(() => setOpen(false), 130)}
        />
      </div>
      {open && !disabled && filtered.length > 0 && (
        <div className={`picker-menu ${dropUp ? 'picker-menu-up' : ''}`}>
          {filtered.map((o) => (
            <button
              type="button"
              key={`${o.value}|${o.sub}`}
              className="picker-opt"
              onMouseDown={(e) => {
                e.preventDefault()
                onChange(o.value)
                setQuery(o.value)
                setOpen(false)
              }}
            >
              <span className="picker-opt-flag">{o.flag}</span>
              <span className="picker-opt-main">
                <span className="picker-opt-name">{teamName(o.value)}</span>
                <span className="picker-opt-sub">{o.sub}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
