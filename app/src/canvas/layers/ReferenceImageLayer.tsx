import { useMemo } from 'react'
import { Layer, Image as KonvaImage } from 'react-konva'
import { useProjectStore } from '../../store/projectStore'
import { useUIStore } from '../../store/uiStore'
import { useHtmlImage } from '../../utils/useHtmlImage'
import type { ReferenceImage } from '../../types/project'

interface ImageNodeProps {
  image: ReferenceImage
  pixelsPerUnit: number
}

function ReferenceImageNode({ image, pixelsPerUnit }: ImageNodeProps) {
  const htmlImage = useHtmlImage(image.src)
  if (!htmlImage) return null
  return (
    <KonvaImage
      image={htmlImage}
      x={image.x * pixelsPerUnit}
      y={image.y * pixelsPerUnit}
      width={image.width * pixelsPerUnit}
      height={image.height * pixelsPerUnit}
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
