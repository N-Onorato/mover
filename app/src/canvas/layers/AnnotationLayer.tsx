import { Layer } from 'react-konva'
import { useProjectStore } from '../../store/projectStore'
import { useUIStore } from '../../store/uiStore'

export function AnnotationLayer() {
  const annotations = useProjectStore((s) => s.project.annotations)
  const showLayer = useUIStore((s) => s.showLayers.annotations)

  if (!showLayer) return <Layer />

  return (
    <Layer>
      {annotations.map((_a) => (
        // TODO: render TextLabel and DimensionLine
        null
      ))}
    </Layer>
  )
}
