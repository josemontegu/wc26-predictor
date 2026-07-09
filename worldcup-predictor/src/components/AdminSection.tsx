import { useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * A collapsible admin section. Collapsed by default, expanded by choice.
 * State-controlled so it survives the Admin page's frequent re-renders (a
 * plain uncontrolled <details> would snap shut whenever the parent updates).
 */
export default function AdminSection({
  icon: Icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: LucideIcon
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
        <Icon className="rule-icon" size={20} aria-hidden="true" />
        <h2>{title}</h2>
        <span className="admin-caret" aria-hidden="true">
          ▸
        </span>
      </summary>
      <div className="admin-section-body">{children}</div>
    </details>
  )
}
