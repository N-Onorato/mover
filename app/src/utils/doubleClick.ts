export const DOUBLE_CLICK_MS = 300

export function isDoubleClick(lastClickMs: number, now: number, windowMs = DOUBLE_CLICK_MS): boolean {
  return now - lastClickMs < windowMs
}
