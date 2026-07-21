import type { ReactNode } from 'react'

interface Props {
  onClose: () => void
  className: string
  contentClassName: string
  children: ReactNode
}

/** H3: shared "scrim + click-outside-to-close" pattern used by MobileDrawer
 * (slide-in drawer) and SettingsPanel (centered modal). `className` styles
 * the full-screen scrim (background, z-index, positioning of the content
 * within it); `contentClassName` styles the content box itself - that's
 * where the two call sites differ. */
export function Overlay({ onClose, className, contentClassName, children }: Props) {
  return (
    <div className={className} onClick={onClose}>
      <div className={contentClassName} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
