import { useState } from 'react'
import { Overlay } from './Overlay'
import styles from './dialog.module.css'

interface Props {
  title: string
  label: string
  /** Pre-filled and selected on open, so renaming is type-over. */
  initialValue?: string
  placeholder?: string
  submitLabel?: string
  hint?: string
  onSubmit: (value: string) => void
  onClose: () => void
}

/** One-field text dialog - naming and renaming sets and pieces. A dialog
 * rather than window.prompt for the same reason CalibrationLengthDialog is:
 * it can say what the name is for and validate inline. */
export function PromptDialog({
  title,
  label,
  initialValue = '',
  placeholder,
  submitLabel = 'Save',
  hint,
  onSubmit,
  onClose,
}: Props) {
  const [value, setValue] = useState(initialValue)
  const trimmed = value.trim()

  function handleSubmit() {
    if (trimmed === '') return
    onSubmit(trimmed)
    onClose()
  }

  return (
    <Overlay onClose={onClose} className={styles.overlay} contentClassName={styles.modal}>
      <div className={styles.header}>
        <span>{title}</span>
        <button className={styles.closeButton} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className={styles.body}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{label}</span>
          <input
            className={styles.input}
            type="text"
            value={value}
            placeholder={placeholder}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setValue(e.target.value)}
            // Handled here because LayoutCanvas's global key handler
            // early-returns for input targets and never sees this one.
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit()
              else if (e.key === 'Escape') onClose()
            }}
          />
        </label>
        {hint && <div className={styles.hint}>{hint}</div>}
        <div className={styles.actions}>
          <button className={styles.button} onClick={handleSubmit} disabled={trimmed === ''}>
            {submitLabel}
          </button>
          <button className={styles.secondaryButton} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Overlay>
  )
}
