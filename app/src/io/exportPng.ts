import type Konva from 'konva'

export interface ExportPngOptions {
  pixelRatio?: number
}

export function exportStageToPng(stage: Konva.Stage, options: ExportPngOptions = {}): void {
  const dataUrl = stage.toDataURL({ pixelRatio: options.pixelRatio ?? 2 })
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = 'layout.png'
  a.click()
}
