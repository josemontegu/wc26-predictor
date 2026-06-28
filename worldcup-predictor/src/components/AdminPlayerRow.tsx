import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'
import EmojiPicker from './EmojiPicker'
import { useT } from '../lib/i18n'

interface Props {
  profile: Profile
  takenEmojis: Set<string>
  onSaved: (p: Profile) => void
}

export default function AdminPlayerRow({ profile, takenEmojis, onSaved }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [nickname, setNickname] = useState(profile.nickname)
  const [emoji, setEmoji] = useState(profile.emoji)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedTick, setSavedTick] = useState(false)

  async function save() {
    const value = nickname.trim()
    if (!value || !emoji) {
      setError(t('Nickname and emoji are required.', 'El apodo y el emoji son obligatorios.'))
      return
    }
    setBusy(true)
    setError(null)
    setSavedTick(false)
    const { data, error } = await supabase
      .from('profiles')
      .update({ nickname: value, display_name: value, emoji })
      .eq('id', profile.id)
      .select()
      .single()
    setBusy(false)
    if (error) {
      setError(
        error.code === '23505'
          ? t('That nickname or emoji is already taken.', 'Ese apodo o emoji ya está en uso.')
          : error.message,
      )
      return
    }
    setSavedTick(true)
    onSaved(data as Profile)
  }

  return (
    <div className="admin-row">
      <button className="admin-row-head" onClick={() => setOpen((o) => !o)}>
        <span className="admin-row-head-l">
          <span className="player-emoji">{profile.emoji || '–'}</span>
          <span className="admin-row-title">
            {profile.nickname || t('(no nickname)', '(sin apodo)')}
            {profile.is_admin && <span className="you-tag">{t('ADMIN', 'ADMIN')}</span>}
          </span>
        </span>
        <span className="admin-row-meta">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="admin-row-body">
          <label>
            {t('Nickname', 'Apodo')}
            <input
              type="text"
              maxLength={24}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </label>
          <label>
            {t('Emoji', 'Emoji')} {emoji && <span className="emoji-current">{emoji}</span>}
          </label>
          <EmojiPicker value={emoji} onChange={setEmoji} taken={takenEmojis} />

          {error && <div className="notice notice-err">{error}</div>}
          {savedTick && <div className="notice notice-ok">{t('Saved ✓', 'Guardado ✓')}</div>}
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? t('Saving…', 'Guardando…') : t('Save player', 'Guardar jugador')}
          </button>
        </div>
      )}
    </div>
  )
}
