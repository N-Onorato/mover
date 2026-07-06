import type { Point } from '../../types/project'
import { useUIStore } from '../../store/uiStore'

export interface ToolHandlers {
  onPointerDown(worldPt: Point, pixelsPerUnit: number): void
  onPointerMove(worldPt: Point, pixelsPerUnit: number): void
  onPointerUp(worldPt: Point, pixelsPerUnit: number): void
  onKeyDown(e: KeyboardEvent): void
  onRightClick(): void
}

export const SelectTool: ToolHandlers = {
  onPointerDown(_worldPt, _ppu) {
    useUIStore.getState().clearSelection()
  },
  onPointerMove(_worldPt, _ppu) {},
  onPointerUp(_worldPt, _ppu) {},
  onKeyDown(_e) {},
  onRightClick() {},
}
