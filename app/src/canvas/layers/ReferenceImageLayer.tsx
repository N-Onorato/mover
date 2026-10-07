import { useMemo } from 'react'
import { Layer, Image as KonvaImage } from 'react-konva'
import { useProjectStore } from '../../store/projectStore'
import { useUIStore } from '../../store/uiStore'
import { useHtmlImage } from '../../hooks/useHtmlImage'
import { withImageDragPreview } from './dragPreview'
import type { ReferenceImage } from '../../types/project'

interface ImageNodeProps {
  image: ReferenceImage
  pixelsPerUnit: number
}

function ReferenceImageNode({ image: committed, pixelsPerUnit }: ImageNodeProps) {
  const htmlImage = useHtmlImage(committed.src)
  // O7 (#47): live preview while this image is part of a multi-selection
  // drag. Each image subscribes only to the drag it is part of (null
  // otherwise), the same F1 rule RoomShape follows. The store isn't mutated
  // until pointer-up.
  const drag = useUIStore((s) =>
    (s.dragState?.kind === 'multi' || s.dragState?.kind === 'multiRotate') &&
    s.dragState.imageIds.includes(committed.id)
      ? s.dragState
      : null,
  )
  const image = withImageDragPreview(committed, drag)
  if (!htmlImage) return null
  // Positioned by center + offset so Konva rotates about the image's center,
  // matching what imageCorners()/pointInRotatedRect() assume when hit-testing
  // and outlining it (and matching FurnitureLayer's convention). Rendering at
  // the raw top-left instead would rotate about that corner, putting the drawn
  // image somewhere the click test doesn't expect for any rotation but 0.
  const w = image.width * pixelsPerUnit
  const h = image.height * pixelsPerUnit
  return (
    <KonvaImage
      image={htmlImage}
      x={(image.x + image.width / 2) * pixelsPerUnit}
      y={(image.y + image.height / 2) * pixelsPerUnit}
      width={w}
      height={h}
      offsetX={w / 2}
      offsetY={h / 2}
      rotation={image.rotation}
      opacity={image.opacity}
      listening={false}
    />
  )
}

interface Props {
  pixelsPerUnit: number
}

const NO_IMAGES: ReferenceImage[] = []

export function ReferenceImageLayer({ pixelsPerUnit }: Props) {
  const images = useProjectStore((s) => s.project.referenceImages)
  const showLayer = useUIStore((s) => s.showLayers.referenceImages)
  const visibleImages = useMemo(
    () => (showLayer ? images.filter((img) => img.visible) : NO_IMAGES),
    [images, showLayer],
  )
  if (!showLayer) return <Layer listening={false} />
  return (
    <Layer listening={false}>
      {visibleImages.map((img) => (
        <ReferenceImageNode key={img.id} image={img} pixelsPerUnit={pixelsPerUnit} />
      ))}
    </Layer>
  )
}
