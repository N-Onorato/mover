/** O4 (#44): where to put the fixed-position layout menu.
 *
 * The menu is portaled to `document.body` (the tab strip is a scroll
 * container and clips anything that hangs below it), so its position can't
 * come from CSS anchoring any more - it is computed from the `⋯` button's
 * viewport rect. Pure so the flip/clamp rules are testable without a DOM. */

export interface AnchorRect {
  left: number
  right: number
  top: number
  bottom: number
}

export interface Size {
  width: number
  height: number
}

/** Space kept between the menu and the viewport edge / the anchor. */
const VIEWPORT_MARGIN = 4
const ANCHOR_GAP = 2

/** Right-aligned under the anchor (as the old absolute menu was), flipped
 * above it when there is no room below, and clamped to the viewport on both
 * axes so a button scrolled half out of view still gets a reachable menu. */
export function placeMenu(
  anchor: AnchorRect,
  menu: Size,
  viewport: Size,
): { left: number; top: number } {
  const maxLeft = viewport.width - menu.width - VIEWPORT_MARGIN
  const left = Math.max(VIEWPORT_MARGIN, Math.min(anchor.right - menu.width, maxLeft))

  const below = anchor.bottom + ANCHOR_GAP
  const above = anchor.top - ANCHOR_GAP - menu.height
  const fitsBelow = below + menu.height <= viewport.height - VIEWPORT_MARGIN
  const fitsAbove = above >= VIEWPORT_MARGIN

  let top: number
  if (fitsBelow || !fitsAbove) {
    // Below by default; when neither side fits, pin to the bottom edge
    // rather than let the last entries fall off-screen.
    top = Math.max(VIEWPORT_MARGIN, Math.min(below, viewport.height - menu.height - VIEWPORT_MARGIN))
  } else {
    top = above
  }
  return { left, top }
}
