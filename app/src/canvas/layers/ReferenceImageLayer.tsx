import { Layer } from 'react-konva'
import { useProjectStore } from '../../store/projectStore'

export function ReferenceImageLayer() {
  const images = useProjectStore((s) => s.project.referenceImages)
  return (
    <Layer>
      {images.map((_img) => (
        // TODO: render KonvaImage per reference image
        null
      ))}
    </Layer>
  )
}
