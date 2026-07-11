import { describe, expect, it } from 'vitest'
import { FOOT_INCH_ZOOM_THRESHOLD, imperialFootInchTicks } from './gridRuler'

describe('imperialFootInchTicks', () => {
  const pixelsPerUnit = 10 // BASE_PIXELS_PER_UNIT

  it('below the zoom threshold, only produces whole-foot ticks', () => {
    const zoom = FOOT_INCH_ZOOM_THRESHOLD - 0.5
    const ticks = imperialFootInchTicks(0, 240, pixelsPerUnit, zoom)
    expect(ticks.length).toBeGreaterThan(0)
    for (const t of ticks) {
      expect(t.worldValue % 12).toBe(0)
      expect(t.kind).toBe('foot')
    }
  })

  it('at/above the zoom threshold, ticks every inch with foot/half-foot/minor classification', () => {
    const zoom = FOOT_INCH_ZOOM_THRESHOLD
    const ticks = imperialFootInchTicks(0, 24 * pixelsPerUnit, pixelsPerUnit, zoom)
    const byValue = new Map(ticks.map((t) => [t.worldValue, t.kind]))
    expect(byValue.get(0)).toBe('foot')
    expect(byValue.get(6)).toBe('half-foot')
    expect(byValue.get(12)).toBe('foot')
    expect(byValue.get(18)).toBe('half-foot')
    expect(byValue.get(24)).toBe('foot')
    expect(byValue.get(1)).toBe('minor')
    expect(byValue.get(5)).toBe('minor')
    expect(byValue.get(7)).toBe('minor')
  })

  it('produces consecutive inch ticks (no gaps) above the threshold', () => {
    const zoom = 3
    const ticks = imperialFootInchTicks(0, 12 * pixelsPerUnit, pixelsPerUnit, zoom)
    const values = ticks.map((t) => t.worldValue)
    expect(values).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('returns no ticks once spacing drops below the visibility floor', () => {
    const ticks = imperialFootInchTicks(0, 240, 0.01, FOOT_INCH_ZOOM_THRESHOLD - 0.5)
    expect(ticks).toEqual([])
  })
})
