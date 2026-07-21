import type { ReactNode } from 'react'
import { Overlay } from './Overlay'
import styles from './MobileDrawer.module.css'

interface Props {
  side: 'left' | 'right'
  onClose: () => void
  children: ReactNode
}

/** Overlay drawer for the narrow-screen layout: hosts the catalog and
 * layer/properties panels that have no room to sit beside the canvas on a
 * phone. Tapping the scrim closes it. */
export function MobileDrawer({ side, onClose, children }: Props) {
  return (
    <Overlay
      onClose={onClose}
      className={styles.overlay}
      contentClassName={`${styles.drawer} ${side === 'left' ? styles.left : styles.right}`}
    >
      {children}
    </Overlay>
  )
}
