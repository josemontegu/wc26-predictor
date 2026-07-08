import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Bullet, BulletValidity, Match } from '../lib/types'
import { bulletOptions, isLocked, hasResult } from '../lib/types'
import { teamName } from '../lib/teamMeta'
import { roundName } from '../lib/format'
import { useT } from '../lib/i18n'
import AdminSection from './AdminSection'

const matchLabel = (m: Match) =>
  `${roundName(m.round)} · ${teamName(m.home_team)} v ${teamName(m.away_team)}`

type OptRow = { en: string; es: string }

/** Admin: create ⚡ bullets (Yes/No or multiple-choice) and resolve them. */
export default function AdminBullets({ matches }: { matches: Match[] }) {
  const t = useT()
  const [bullets, setBullets] = useState<Bullet[]>([])
  const [validity, setValidity] = useState<Record<string, BulletValidity>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Create form
  const [matchId, setMatchId] = useState('')
  const [qEn, setQEn] = useState('')
  const [qEs, setQEs] = useState('')
  const [emoji, setEmoji] = useState('⚡')
  const [points, setPoints] = useState(3)
  const [kind, setKind] = useState<'yesno' | 'multi'>('yesno')
  const [optRows, setOptRows] = useState<OptRow[]>([
    { en: '', es: '' },
    { en: '', es: '' },
  ])

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('bullets').select('*').order('created_at')
    if (error) {
      setBullets([])
      return
    }
    setBullets((data as Bullet[]) ?? [])
    const { data: v } = await supabase.from('bullet_validity').select('*')
    const vm: Record<string, BulletValidity> = {}
    for (const row of (v as BulletValidity[]) ?? []) vm[row.bullet_id] = row
    setValidity(vm)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function resetForm() {
    setQEn('')
    setQEs('')
    setMatchId('')
    setKind('yesno')
    setOptRows([
      { en: '', es: '' },
      { en: '', es: '' },
    ])
  }

  async function create() {
    if (!matchId || !qEn.trim() || !qEs.trim()) {
      setMsg(t('Pick a match and fill both questions.', 'Elige un partido y completa ambas preguntas.'))
      return
    }
    let options: Bullet['options'] = null
    if (kind === 'multi') {
      const filled = optRows.filter((r) => r.en.trim() && r.es.trim())
      if (filled.length < 2) {
        setMsg(t('Add at least two options (English & Spanish).', 'Añade al menos dos opciones (inglés y español).'))
        return
      }
      options = filled.map((r, i) => ({ key: `o${i + 1}`, label_en: r.en.trim(), label_es: r.es.trim() }))
    }
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.from('bullets').insert({
      match_id: matchId,
      question_en: qEn.trim(),
      question_es: qEs.trim(),
      emoji: emoji.trim() || '⚡',
      points,
      options,
    })
    setBusy(false)
    if (error) {
      setMsg(error.message)
      return
    }
    resetForm()
    load()
  }

  async function setAnswer(id: string, answer: string | null) {
    setBusy(true)
    await supabase.from('bullets').update({ answer }).eq('id', id)
    setBusy(false)
    load()
  }

  async function remove(id: string) {
    setBusy(true)
    await supabase.from('bullets').delete().eq('id', id)
    setBusy(false)
    load()
  }

  const eligible = matches.filter((m) => m.home_team !== 'TBD' && m.away_team !== 'TBD')
  const byId = new Map(matches.map((m) => [m.id, m]))

  return (
    <AdminSection icon="⚡" title={t('Bullets', 'Bullets')}>
      <p className="muted small">
        {t(
          'Prop bets on a match — Yes/No or multiple-choice. Flat points, and only counts if every official player who predicted the match also answered before kick-off.',
          'Apuestas sobre un partido — Sí/No o de opción múltiple. Puntos fijos, y solo cuenta si todos los jugadores oficiales que pronosticaron el partido también respondieron antes del inicio.',
        )}
      </p>

      {/* Create */}
      <div className="bullet-admin-form">
        <select value={matchId} onChange={(e) => setMatchId(e.target.value)}>
          <option value="">{t('Select a match…', 'Elige un partido…')}</option>
          {eligible.map((m) => (
            <option key={m.id} value={m.id}>
              {matchLabel(m)}
              {hasResult(m) ? ` (${t('played', 'jugado')})` : isLocked(m) ? ` (${t('locked', 'cerrado')})` : ''}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder={t('Question (English)', 'Pregunta (inglés)')}
          value={qEn}
          onChange={(e) => setQEn(e.target.value)}
        />
        <input
          type="text"
          placeholder={t('Question (Spanish)', 'Pregunta (español)')}
          value={qEs}
          onChange={(e) => setQEs(e.target.value)}
        />

        {/* Answer type */}
        <div className="bullet-admin-kind">
          <button
            type="button"
            className={`btn btn-sm ${kind === 'yesno' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setKind('yesno')}
          >
            {t('Yes / No', 'Sí / No')}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${kind === 'multi' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setKind('multi')}
          >
            {t('Multiple choice', 'Opción múltiple')}
          </button>
        </div>

        {kind === 'multi' && (
          <div className="bullet-admin-options">
            {optRows.map((r, i) => (
              <div className="bullet-admin-opt-row" key={i}>
                <input
                  type="text"
                  placeholder={t(`Option ${i + 1} (EN)`, `Opción ${i + 1} (EN)`)}
                  value={r.en}
                  onChange={(e) =>
                    setOptRows((rows) => rows.map((x, j) => (j === i ? { ...x, en: e.target.value } : x)))
                  }
                />
                <input
                  type="text"
                  placeholder={t(`Option ${i + 1} (ES)`, `Opción ${i + 1} (ES)`)}
                  value={r.es}
                  onChange={(e) =>
                    setOptRows((rows) => rows.map((x, j) => (j === i ? { ...x, es: e.target.value } : x)))
                  }
                />
                {optRows.length > 2 && (
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost bullet-admin-del"
                    onClick={() => setOptRows((rows) => rows.filter((_, j) => j !== i))}
                    aria-label={t('Remove option', 'Quitar opción')}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {optRows.length < 6 && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setOptRows((rows) => [...rows, { en: '', es: '' }])}
              >
                + {t('Add option', 'Añadir opción')}
              </button>
            )}
          </div>
        )}

        <div className="bullet-admin-row">
          <input
            type="text"
            className="bullet-admin-emoji"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            aria-label={t('Emoji', 'Emoji')}
          />
          <input
            type="number"
            className="bullet-admin-pts"
            value={points}
            min={1}
            max={20}
            onChange={(e) => setPoints(Number(e.target.value) || 3)}
            aria-label={t('Points', 'Puntos')}
          />
          <button className="btn btn-primary btn-sm" onClick={create} disabled={busy}>
            {t('Add bullet', 'Añadir bullet')}
          </button>
        </div>
        {msg && <div className="notice notice-err">{msg}</div>}
      </div>

      {/* Existing */}
      {bullets.length === 0 ? (
        <p className="muted small">{t('No bullets yet.', 'Aún no hay bullets.')}</p>
      ) : (
        <div className="bullet-admin-list">
          {bullets.map((b) => {
            const m = byId.get(b.match_id)
            const v = validity[b.id]
            const opts = bulletOptions(b)
            return (
              <div className="bullet-admin-item" key={b.id}>
                <div className="bullet-admin-q">
                  <strong>
                    {b.emoji} {b.question_en}
                  </strong>
                  <span className="muted small">
                    {m ? matchLabel(m) : '—'} · +{b.points}
                    {v?.locked
                      ? v.everyone_in
                        ? ` · ✅ ${t('all in', 'todos dentro')}`
                        : ` · ❌ ${t('void', 'anulada')}`
                      : ` · ⏳ ${t('open', 'abierta')}`}
                  </span>
                </div>
                <div className="bullet-admin-answer">
                  <span className="muted small">{t('Answer:', 'Respuesta:')}</span>
                  {opts.map((o) => (
                    <button
                      key={o.key}
                      className={`btn btn-sm ${b.answer === o.key ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setAnswer(b.id, o.key)}
                      disabled={busy}
                    >
                      {t(o.label_en, o.label_es)}
                    </button>
                  ))}
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => setAnswer(b.id, null)}
                    disabled={busy || b.answer === null}
                  >
                    {t('Clear', 'Limpiar')}
                  </button>
                  <button
                    className="btn btn-sm btn-ghost bullet-admin-del"
                    onClick={() => remove(b.id)}
                    disabled={busy}
                    aria-label={t('Delete', 'Eliminar')}
                  >
                    🗑
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </AdminSection>
  )
}
