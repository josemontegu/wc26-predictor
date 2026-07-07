import { useState, type ReactNode } from 'react'

/**
 * A collapsible admin section — collapsed by default, expanded by choice.
 * State-controlled so it survives the Admin page's frequent re-renders (a
 * plain uncontrolled <details> would snap shut whenever the parent updates).
 */
export default function AdminSection({
  icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: string
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <details
      className="form-card admin-section"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="admin-section-summary">
        <span className="rule-icon">{icon}</span>
        <h2>{title}</h2>
        <span className="admin-caret" aria-hidden="true">
          ▸
        </span>
      </summary>
      <div className="admin-section-body">{children}</div>
    </details>
  )
}
