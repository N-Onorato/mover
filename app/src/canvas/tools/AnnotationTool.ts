import type { ToolHandlers } from './SelectTool'

export const AnnotationTool: ToolHandlers = {
  onPointerDown(_worldPt, _rawWorldPt, _ppu, _modifiers) {},
  onPointerMove(_worldPt, _ppu, _modifiers) {},
  onPointerUp(_worldPt, _ppu, _modifiers) {},
  onKeyDown(_e) {},
  onRightClick() {},
}
