import { useMemo } from 'react'
import { Layer, Image as KonvaImage } from 'react-konva'
import { useProjectStore } from '../../store/projectStore'
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

export function ReferenceImageLayer({ pixelsPerUnit }: Props) {
  const images = useProjectStore((s) => s.project.referenceImages)
  const visibleImages = useMemo(() => images.filter((img) => img.visible), [images])
  return (
    <Layer listening={false}>
      {visibleImages.map((img) => (
        <ReferenceImageNode key={img.id} image={img} pixelsPerUnit={pixelsPerUnit} />
      ))}
    </Layer>
  )
}
