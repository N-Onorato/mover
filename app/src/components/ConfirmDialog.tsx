import { Overlay } from './Overlay'
import styles from './dialog.module.css'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onClose: () => void
}

/** Confirmation for actions undo can't reach. The furniture library lives
 * outside the Project, so historyStore snapshots don't cover it - deleting a
 * set or a piece is permanent, and says so. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onClose,
}: Props) {
  function handleConfirm() {
    onConfirm()
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
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button className={styles.dangerButton} onClick={handleConfirm} autoFocus>
            {confirmLabel}
          </button>
          <button className={styles.secondaryButton} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Overlay>
  )
}
