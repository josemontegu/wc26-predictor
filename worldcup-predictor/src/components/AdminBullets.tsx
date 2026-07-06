import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Bullet, BulletValidity, Match } from '../lib/types'
import { isLocked, hasResult } from '../lib/types'
import { teamName } from '../lib/teamMeta'
import { roundName } from '../lib/format'
import { useT } from '../lib/i18n'

const matchLabel = (m: Match) =>
  `${roundName(m.round)} · ${teamName(m.home_team)} v ${teamName(m.away_team)}`

/** Admin: create ⚡ bullets and resolve their yes/no answer. */
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

  async function create() {
    if (!matchId || !qEn.trim() || !qEs.trim()) {
      setMsg(t('Pick a match and fill both questions.', 'Elige un partido y completa ambas preguntas.'))
      return
    }
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.from('bullets').insert({
      match_id: matchId,
      question_en: qEn.trim(),
      question_es: qEs.trim(),
      emoji: emoji.trim() || '⚡',
      points,
    })
    setBusy(false)
    if (error) {
      setMsg(error.message)
      return
    }
    setQEn('')
    setQEs('')
    setMatchId('')
    load()
  }

  async function setAnswer(id: string, answer: boolean | null) {
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
    <section className="form-card">
      <h2>⚡ {t('Bullets', 'Bullets')}</h2>
      <p className="muted small">
        {t(
          'Yes/No prop bets on a match. Flat points, and only counts if every official player who predicted the match also answered before kick-off.',
          'Apuestas Sí/No sobre un partido. Puntos fijos, y solo cuenta si todos los jugadores oficiales que pronosticaron el partido también respondieron antes del inicio.',
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
                  <button
                    className={`btn btn-sm ${b.answer === true ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setAnswer(b.id, true)}
                    disabled={busy}
                  >
                    {t('Yes', 'Sí')}
                  </button>
                  <button
                    className={`btn btn-sm ${b.answer === false ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setAnswer(b.id, false)}
                    disabled={busy}
                  >
                    {t('No', 'No')}
                  </button>
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
    </section>
  )
}
