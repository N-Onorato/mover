import { Fragment } from 'react'
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
  return (
    <Layer listening={false}>
      {images.filter((img) => img.visible).map((img) => (
        <Fragment key={img.id}>
          <ReferenceImageNode image={img} pixelsPerUnit={pixelsPerUnit} />
        </Fragment>
      ))}
    </Layer>
  )
}
