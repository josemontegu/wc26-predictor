import { PROFILE_EMOJIS } from '../lib/emojis'
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
      {PROFILE_EMOJIS.map((em) => {
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
  )
}
