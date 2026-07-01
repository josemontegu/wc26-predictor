import { EMOJI_CATEGORIES } from '../lib/emojis'
import { useT } from '../lib/i18n'

export default function EmojiPicker({
  value,
  onChange,
  taken,
}: {
  value: string
  onChange: (emoji: string) => void
  taken: Set<string>
}) {
  const t = useT()
  return (
    <div className="emoji-grid">
      {EMOJI_CATEGORIES.map((cat) => (
        <div className="emoji-cat" key={cat.en}>
          <div className="emoji-cat-label">{t(cat.en, cat.es)}</div>
          <div className="emoji-cat-grid">
            {cat.emojis.map((em) => {
              const isTaken = taken.has(em) && value !== em
              return (
                <button
                  type="button"
                  key={em}
                  className={`emoji-opt ${value === em ? 'emoji-selected' : ''}`}
                  disabled={isTaken}
                  title={isTaken ? t('Taken', 'Ocupado') : undefined}
                  onClick={() => onChange(em)}
                >
                  {em}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
