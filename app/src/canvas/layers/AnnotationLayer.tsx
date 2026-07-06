import { Layer } from 'react-konva'
import { useProjectStore } from '../../store/projectStore'

export function AnnotationLayer() {
  const annotations = useProjectStore((s) => s.project.annotations)
  return (
    <Layer>
      {annotations.map((_a) => (
        // TODO: render TextLabel and DimensionLine
        null
      ))}
    </Layer>
  )
}
