/** E1: hit-test corridor scales with a wall's rendered thickness so the
 * clickable area tracks what's actually drawn on screen at any zoom. Shared
 * by SelectTool (room + interior wall hit-testing) and HighlightLayer
 * (vertex marker sizing). */
export function wallThresholdWorld(basePx: number, wallThicknessWorld: number, ppu: number): number {
  return Math.max(basePx, (wallThicknessWorld * ppu) / 2) / ppu
}
