import type { FurnitureInstance, InteriorWall, Point, ReferenceImage } from '../../types/project'
import type { DragState } from '../../store/uiStore'
import { rotateFurniture, rotateImage, rotateInteriorWall } from '../tools/multiRotate'

// Live-preview substitution while a drag is in progress: the store isn't
// mutated until pointer-up, so layers render the entity with the drag applied.
// Shared by the entity layers and HighlightLayer so the drawn entity and its
// selection outline/handles can't disagree about where it is.

export function withFurnitureDragPreview(f: FurnitureInstance, drag: DragState | null): FurnitureInstance {
  switch (drag?.kind) {
    case 'furnitureResize':
      return drag.id === f.id
        ? { ...f, x: drag.currentX, y: drag.currentY, width: drag.currentWidth, depth: drag.currentDepth }
        : f
    case 'furnitureRotate':
      return drag.id === f.id ? { ...f, rotation: drag.currentRotation } : f
    case 'multi':
      return drag.furnitureIds.includes(f.id) ? { ...f, x: f.x + drag.dx, y: f.y + drag.dy } : f
    case 'multiRotate':
      // O7 (#47): rigid rotation of the selection about its pivot.
      return drag.furnitureIds.includes(f.id) ? { ...f, ...rotateFurniture(f, drag.pivot, drag.delta) } : f
    default:
      return f
  }
}

export function withImageDragPreview(img: ReferenceImage, drag: DragState | null): ReferenceImage {
  switch (drag?.kind) {
    case 'multi':
      return drag.imageIds.includes(img.id) ? { ...img, x: img.x + drag.dx, y: img.y + drag.dy } : img
    case 'multiRotate':
      return drag.imageIds.includes(img.id) ? { ...img, ...rotateImage(img, drag.pivot, drag.delta) } : img
    default:
      return img
  }
}

export function wallEndpointsWithDragPreview(
  w: InteriorWall,
  drag: DragState | null,
): { a: Point; b: Point } {
  switch (drag?.kind) {
    case 'interiorWallEndpoint':
      return drag.wallId === w.id ? { a: drag.currentA, b: drag.currentB } : w
    case 'multi':
      return drag.wallIds.includes(w.id)
        ? { a: { x: w.a.x + drag.dx, y: w.a.y + drag.dy }, b: { x: w.b.x + drag.dx, y: w.b.y + drag.dy } }
        : w
    case 'multiRotate':
      return drag.wallIds.includes(w.id) ? rotateInteriorWall(w, drag.pivot, drag.delta) : w
    default:
      return w
  }
}
