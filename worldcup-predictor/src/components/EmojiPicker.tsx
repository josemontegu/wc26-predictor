import { PROFILE_EMOJIS } from '../lib/emojis'

export default function EmojiPicker({
  value,
  onChange,
  taken,
}: {
  value: string
  onChange: (emoji: string) => void
  taken: Set<string>
}) {
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
            title={isTaken ? 'Taken' : undefined}
            onClick={() => onChange(em)}
          >
            {em}
          </button>
        )
      })}
    </div>
  )
}
