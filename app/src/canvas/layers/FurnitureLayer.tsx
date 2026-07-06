import { Layer } from 'react-konva'
import { useProjectStore } from '../../store/projectStore'

interface Props {
  pixelsPerUnit: number
}

export function FurnitureLayer({ pixelsPerUnit: _pixelsPerUnit }: Props) {
  const instances = useProjectStore((s) => s.project.furnitureInstances)
  return (
    <Layer>
      {instances.filter((f) => f.visible).map((_f) => (
        // TODO: render furniture shape per instance
        null
      ))}
    </Layer>
  )
}
