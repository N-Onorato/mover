import { adaptiveGridSize } from './snap'
import type { UnitSystem } from './units'
import type { ProjectSettings } from '../types/project'

// Whether the imperial feet-inches ruler mode (vs. plain decimal grid ticks)
// applies for the given units/ruler-mode settings.
export function isFootInchRuler(units: UnitSystem, rulerMode: ProjectSettings['rulerMode']): boolean {
  return units === 'imperial' && rulerMode === 'feet-inches'
}

// Grid-line spacing in screen pixels for the given base grid size and zoom.
export function gridSpacingPx(baseGridSize: number, zoom: number, pixelsPerUnit: number): number {
  return adaptiveGridSize(baseGridSize, zoom) * pixelsPerUnit
}

// Ticks closer together than this (in pixels) are too dense to be useful.
const MIN_VISIBLE_SPACING_PX = 4

// Positions (in the same pixel space as viewStart/viewEnd) of grid lines/ticks
// spaced spacingPx apart that fall within [viewStart, viewEnd]. Returns an
// empty array once spacingPx drops below a usable on-screen density.
export function gridTickPositions(viewStart: number, viewEnd: number, spacingPx: number): number[] {
  if (spacingPx < MIN_VISIBLE_SPACING_PX) return []
  const positions: number[] = []
  const start = Math.floor(viewStart / spacingPx) * spacingPx
  for (let v = start; v <= viewEnd; v += spacingPx) positions.push(v)
  return positions
}

// Smallest power-of-two multiple of spacingPx that is at least minPx wide,
// used to decide which grid ticks get a label at low zoom levels.
export function labelStepMultiplier(spacingPx: number, minPx: number): number {
  let mult = 1
  while (spacingPx * mult < minPx) mult *= 2
  return mult
}

// Whether the tick at `pos` falls on a label boundary (a multiple of labelSpacingPx).
export function isMajorTick(pos: number, labelSpacingPx: number): boolean {
  return Math.abs(Math.round(pos / labelSpacingPx) * labelSpacingPx - pos) < 0.01
}

// Below this zoom, imperial "feet-inches" ruler mode shows foot marks only.
export const FOOT_INCH_ZOOM_THRESHOLD = 1.5

export type ImperialTickKind = 'foot' | 'half-foot' | 'minor'

export interface ImperialTick {
  pos: number // pixel position (same space as viewStart/viewEnd)
  worldValue: number // world units (inches) at this tick
  kind: ImperialTickKind
}

// Feet/inch-aware tick positions for imperial "feet-inches" ruler mode.
// Below FOOT_INCH_ZOOM_THRESHOLD, only whole-foot ticks are produced (no inch
// clutter). At/above it, every inch is ticked: multiples of 12" are "foot"
// ticks, multiples of 6" (not 12") are "half-foot" ticks, everything else is
// an unlabeled "minor" tick.
export function imperialFootInchTicks(
  viewStart: number,
  viewEnd: number,
  pixelsPerUnit: number,
  zoom: number,
): ImperialTick[] {
  const stepIn = zoom >= FOOT_INCH_ZOOM_THRESHOLD ? 1 : 12
  const spacingPx = stepIn * pixelsPerUnit
  if (spacingPx < MIN_VISIBLE_SPACING_PX) return []

  const ticks: ImperialTick[] = []
  const startIn = Math.floor(viewStart / pixelsPerUnit / stepIn) * stepIn
  const endIn = viewEnd / pixelsPerUnit
  for (let worldValue = startIn; worldValue <= endIn; worldValue += stepIn) {
    const kind: ImperialTickKind =
      worldValue % 12 === 0 ? 'foot' : worldValue % 6 === 0 ? 'half-foot' : 'minor'
    ticks.push({ pos: worldValue * pixelsPerUnit, worldValue, kind })
  }
  return ticks
}
