import { useEffect, useRef } from 'react'
import { adaptiveGridSize } from '../utils/snap'
import { formatLength } from '../utils/units'
import type { UnitSystem } from '../utils/units'

export const RULER_THICKNESS = 20

interface Props {
  pixelsPerUnit: number
  gridSize: number
  viewX: number
  viewY: number
  zoom: number
  width: number
  height: number
  units: UnitSystem
}

const BG = '#1a1a1a'
const TICK_COLOR = '#777'
const MAJOR_TICK_COLOR = '#aaa'
const TEXT_COLOR = '#ccc'
const BORDER_COLOR = '#3a3a3a'

function labelStepMultiplier(spacingPx: number, minPx: number): number {
  let mult = 1
  while (spacingPx * mult < minPx) mult *= 2
  return mult
}

export function Rulers({ pixelsPerUnit, gridSize, viewX, viewY, zoom, width, height, units }: Props) {
  const topRef = useRef<HTMLCanvasElement>(null)
  const leftRef = useRef<HTMLCanvasElement>(null)
  const topWidth = Math.max(0, width - RULER_THICKNESS)
  const leftHeight = Math.max(0, height - RULER_THICKNESS)

  useEffect(() => {
    const spacing = adaptiveGridSize(gridSize, zoom)
    const spacingPx = spacing * pixelsPerUnit
    const mult = spacingPx > 0 ? labelStepMultiplier(spacingPx, 50) : 1
    const labelSpacingPx = spacingPx * mult

    const dpr = window.devicePixelRatio || 1

    // Top (horizontal) ruler
    const topCanvas = topRef.current
    if (topCanvas && topWidth > 0) {
      topCanvas.width = topWidth * dpr
      topCanvas.height = RULER_THICKNESS * dpr
      topCanvas.style.width = `${topWidth}px`
      topCanvas.style.height = `${RULER_THICKNESS}px`
      const ctx = topCanvas.getContext('2d')!
      ctx.scale(dpr, dpr)
      ctx.fillStyle = BG
      ctx.fillRect(0, 0, topWidth, RULER_THICKNESS)
      ctx.strokeStyle = BORDER_COLOR
      ctx.beginPath()
      ctx.moveTo(0, RULER_THICKNESS - 0.5)
      ctx.lineTo(topWidth, RULER_THICKNESS - 0.5)
      ctx.stroke()

      if (spacingPx >= 4) {
        const left = -(viewX - RULER_THICKNESS)
        const right = left + topWidth
        const startX = Math.floor(left / spacingPx) * spacingPx
        ctx.font = '10px sans-serif'
        ctx.textBaseline = 'middle'
        for (let x = startX; x <= right; x += spacingPx) {
          const screenX = x + viewX - RULER_THICKNESS
          const isMajor = Math.abs(Math.round(x / labelSpacingPx) * labelSpacingPx - x) < 0.01
          ctx.strokeStyle = isMajor ? MAJOR_TICK_COLOR : TICK_COLOR
          ctx.beginPath()
          ctx.moveTo(screenX, RULER_THICKNESS)
          ctx.lineTo(screenX, isMajor ? RULER_THICKNESS - 10 : RULER_THICKNESS - 5)
          ctx.stroke()
          if (isMajor) {
            const worldValue = x / pixelsPerUnit
            ctx.fillStyle = TEXT_COLOR
            ctx.fillText(formatLength(worldValue, units), screenX + 3, RULER_THICKNESS / 2 - 3)
          }
        }
      }
    }

    // Left (vertical) ruler
    const leftCanvas = leftRef.current
    if (leftCanvas && leftHeight > 0) {
      leftCanvas.width = RULER_THICKNESS * dpr
      leftCanvas.height = leftHeight * dpr
      leftCanvas.style.width = `${RULER_THICKNESS}px`
      leftCanvas.style.height = `${leftHeight}px`
      const ctx = leftCanvas.getContext('2d')!
      ctx.scale(dpr, dpr)
      ctx.fillStyle = BG
      ctx.fillRect(0, 0, RULER_THICKNESS, leftHeight)
      ctx.strokeStyle = BORDER_COLOR
      ctx.beginPath()
      ctx.moveTo(RULER_THICKNESS - 0.5, 0)
      ctx.lineTo(RULER_THICKNESS - 0.5, leftHeight)
      ctx.stroke()

      if (spacingPx >= 4) {
        const top = -(viewY - RULER_THICKNESS)
        const bottom = top + leftHeight
        const startY = Math.floor(top / spacingPx) * spacingPx
        ctx.font = '10px sans-serif'
        for (let y = startY; y <= bottom; y += spacingPx) {
          const screenY = y + viewY - RULER_THICKNESS
          const isMajor = Math.abs(Math.round(y / labelSpacingPx) * labelSpacingPx - y) < 0.01
          ctx.strokeStyle = isMajor ? MAJOR_TICK_COLOR : TICK_COLOR
          ctx.beginPath()
          ctx.moveTo(RULER_THICKNESS, screenY)
          ctx.lineTo(isMajor ? RULER_THICKNESS - 10 : RULER_THICKNESS - 5, screenY)
          ctx.stroke()
          if (isMajor) {
            const worldValue = y / pixelsPerUnit
            ctx.save()
            ctx.translate(RULER_THICKNESS / 2 + 3, screenY - 3)
            ctx.rotate(-Math.PI / 2)
            ctx.fillStyle = TEXT_COLOR
            ctx.textBaseline = 'middle'
            ctx.fillText(formatLength(worldValue, units), 0, 0)
            ctx.restore()
          }
        }
      }
    }
  }, [pixelsPerUnit, gridSize, viewX, viewY, zoom, width, height, units])

  return (
    <>
      <canvas
        ref={topRef}
        style={{
          position: 'absolute',
          top: 0,
          left: RULER_THICKNESS,
          pointerEvents: 'none',
          zIndex: 5,
        }}
      />
      <canvas
        ref={leftRef}
        style={{
          position: 'absolute',
          top: RULER_THICKNESS,
          left: 0,
          pointerEvents: 'none',
          zIndex: 5,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: RULER_THICKNESS,
          height: RULER_THICKNESS,
          background: BG,
          borderRight: `1px solid ${BORDER_COLOR}`,
          borderBottom: `1px solid ${BORDER_COLOR}`,
          zIndex: 5,
          pointerEvents: 'none',
        }}
      />
    </>
  )
}
