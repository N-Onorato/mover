import { describe, expect, it } from 'vitest'
import { computePreviewLayout, MAX_PREVIEW_PX, MIN_PREVIEW_PX } from './dragPreview'

describe('computePreviewLayout', () => {
  it('draws the footprint at the on-canvas scale', () => {
    // 80" x 36" sofa at 10 px/unit (zoom 1).
    const layout = computePreviewLayout({ width: 80, depth: 36 }, 10)
    expect(layout.width).toBe(320)
    expect(layout.height).toBe(Math.round(36 * 10 * (320 / 800)))
  })

  it('tracks the zoom', () => {
    const at1 = computePreviewLayout({ width: 20, depth: 10 }, 10)
    const at2 = computePreviewLayout({ width: 20, depth: 10 }, 20)
    expect(at1).toMatchObject({ width: 200, height: 100 })
    expect(at2).toMatchObject({ width: 320, height: 160 })
  })

  it('caps large pieces on the longest side, keeping the aspect ratio', () => {
    const layout = computePreviewLayout({ width: 100, depth: 200 }, 10)
    expect(layout.height).toBe(MAX_PREVIEW_PX)
    expect(layout.width).toBe(MAX_PREVIEW_PX / 2)
  })

  it('grows tiny pieces to the minimum, keeping the aspect ratio', () => {
    const layout = computePreviewLayout({ width: 2, depth: 1 }, 1)
    expect(layout.width).toBe(MIN_PREVIEW_PX)
    expect(layout.height).toBe(MIN_PREVIEW_PX / 2)
  })

  it('never collapses a side to nothing for extreme aspect ratios', () => {
    const layout = computePreviewLayout({ width: 1000, depth: 1 }, 10)
    expect(layout.width).toBe(MAX_PREVIEW_PX)
    expect(layout.height).toBeGreaterThanOrEqual(2)
  })

  it('puts the hotspot at the center of the final (capped) image', () => {
    // The drop point becomes the piece's center, so the cursor must be at the
    // center of the ghost - on the scaled size, not the unscaled footprint.
    const capped = computePreviewLayout({ width: 100, depth: 200 }, 10)
    expect(capped.hotspotX).toBe(capped.width / 2)
    expect(capped.hotspotY).toBe(capped.height / 2)
    const plain = computePreviewLayout({ width: 20, depth: 10 }, 10)
    expect(plain.hotspotX).toBe(100)
    expect(plain.hotspotY).toBe(50)
  })

  it('handles a degenerate zero-size definition', () => {
    const layout = computePreviewLayout({ width: 0, depth: 0 }, 10)
    expect(layout.width).toBe(MIN_PREVIEW_PX)
    expect(layout.height).toBe(MIN_PREVIEW_PX)
  })
})
