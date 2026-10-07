import { describe, expect, it } from 'vitest'
import { placeMenu } from './menuPlacement'

const viewport = { width: 1000, height: 700 }
const menu = { width: 150, height: 100 }

describe('placeMenu', () => {
  it('right-aligns under the anchor', () => {
    const anchor = { left: 300, right: 320, top: 40, bottom: 60 }
    expect(placeMenu(anchor, menu, viewport)).toEqual({ left: 170, top: 62 })
  })

  it('clamps to the left edge when the anchor is near it', () => {
    const anchor = { left: 0, right: 20, top: 40, bottom: 60 }
    expect(placeMenu(anchor, menu, viewport).left).toBe(4)
  })

  it('clamps to the right edge when the anchor is past it', () => {
    const anchor = { left: 990, right: 1010, top: 40, bottom: 60 }
    expect(placeMenu(anchor, menu, viewport).left).toBe(1000 - 150 - 4)
  })

  it('flips above when there is no room below', () => {
    const anchor = { left: 300, right: 320, top: 640, bottom: 660 }
    expect(placeMenu(anchor, menu, viewport).top).toBe(640 - 2 - 100)
  })

  it('pins to the bottom edge when neither side has room', () => {
    const tall = { width: 150, height: 400 }
    const short = { width: 1000, height: 300 }
    const anchor = { left: 300, right: 320, top: 140, bottom: 160 }
    // Doesn't fit below (162 + 400 > 296) or above (140 - 2 - 400 < 4), and
    // is taller than the viewport: clamped to the top margin.
    expect(placeMenu(anchor, tall, short).top).toBe(4)
  })
})
