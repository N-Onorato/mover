import { useEffect, useMemo, useRef, useState } from 'react'
import type Konva from 'konva'
import { Layer, Rect, Stage } from 'react-konva'
import { useProjectStore } from '../store/projectStore'
import { useUIStore } from '../store/uiStore'
import { getStage } from '../canvas/stageRegistry'
import { GridLayer } from '../canvas/layers/GridLayer'
import { ReferenceImageLayer } from '../canvas/layers/ReferenceImageLayer'
import { RoomLayer } from '../canvas/layers/RoomLayer'
import { InteriorWallLayer } from '../canvas/layers/InteriorWallLayer'
import { FurnitureLayer } from '../canvas/layers/FurnitureLayer'
import { AnnotationLayer } from '../canvas/layers/AnnotationLayer'
import { BASE_PIXELS_PER_UNIT } from '../utils/scale'
import { activeFurnitureLayout } from '../project/layouts'
import { findShortcut, isTypingTarget } from '../keyboard/shortcuts'
import { useMediaQuery } from '../hooks/useMediaQuery'
import {
  EXPORT_SCALES,
  MAX_EXPORT_PIXELS,
  MAX_EXPORT_SIDE,
  contentBounds,
  defaultExportName,
  downloadDataUrl,
  exportMargin,
  fitExportSize,
  padRect,
  pngFilename,
  resolveBackground,
  viewRect,
  type ExportArea,
  type ExportBackground,
  type ExportScale,
  type WorldRect,
} from '../io/exportPng'
import { Overlay } from './Overlay'
import { useExportPngDialogStore } from './exportPngDialogStore'
import styles from './ExportPngDialog.module.css'

/** Bounding box the preview Stage is fitted into, in CSS pixels. */
const PREVIEW_BOX = { width: 440, height: 330 }
const PREVIEW_BOX_NARROW = { width: 300, height: 200 }

/** Slack, in Stage pixels, added to the background rect and the grid so
 * neither can leave a hairline gap at the right or bottom edge of the area. */
const EDGE_SLACK = 4

/** Mounted once from App; the body below mounts only while the dialog is
 * open, so every open starts from the defaults rather than the last use. */
export function ExportPngDialog() {
  const open = useExportPngDialogStore((s) => s.open)
  return open ? <ExportPngDialogBody /> : null
}

/** O5 (#45): File > Export as PNG. A live preview plus the options the
 * export honours. The preview is a real react-konva Stage built from project
 * data with the chosen options - not the interactive canvas - and "Export"
 * calls `toDataURL` on that very Stage, so the file is the preview rendered
 * at full resolution rather than a second render that could drift from it.
 *
 * The Stage is drawn in "layer pixels" exactly as the live canvas is (world
 * units times BASE_PIXELS_PER_UNIT times zoom), then shrunk to fit the preview
 * box with the Stage's own scale. Layers therefore get the same pixelsPerUnit
 * and zoom they would on the main canvas (which is what decides grid spacing
 * and tick density), and the output resolution is purely a pixelRatio on
 * export. HighlightLayer and SelectionLayer are simply not rendered, so
 * selection outlines, handles and drawing previews can never appear.
 *
 * Layers-panel visibility (`uiStore.showLayers`) and `showWallLabels` are read
 * by the layers themselves, so what the canvas hides, the export hides too;
 * the dialog's include toggles add to that, they cannot override it. */
function ExportPngDialogBody() {
  const hide = useExportPngDialogStore((s) => s.hide)
  const project = useProjectStore((s) => s.project)
  const selectedIds = useUIStore((s) => s.selectedIds)
  const showLayers = useUIStore((s) => s.showLayers)
  const view = useUIStore((s) => s.view)
  const showGrid = useUIStore((s) => s.showGrid)
  const narrow = useMediaQuery('(max-width: 720px)')
  const previewBox = narrow ? PREVIEW_BOX_NARROW : PREVIEW_BOX

  const stageRef = useRef<Konva.Stage>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // "Current view" needs the live canvas's pixel size; it is read once, since
  // the modal blocks resizing the canvas from within the app.
  const viewport = useMemo(() => {
    const live = getStage()
    return live ? { width: live.width(), height: live.height() } : null
  }, [])

  const settings = project.settings
  const activeLayoutId = activeFurnitureLayout(project)?.id ?? ''

  const [area, setArea] = useState<ExportArea>('content')
  // Starts as the canvas shows it.
  const [includeGrid, setIncludeGrid] = useState(showGrid)
  const [includeImages, setIncludeImages] = useState(true)
  const [includeAnnotations, setIncludeAnnotations] = useState(true)
  const [background, setBackground] = useState<ExportBackground>('project')
  const [customColor, setCustomColor] = useState('#ffffff')
  const [scale, setScale] = useState<ExportScale>(1)
  const [layoutId, setLayoutId] = useState(activeLayoutId)
  // null until the user types; then their text wins over the generated name.
  const [nameOverride, setNameOverride] = useState<string | null>(null)

  const layoutName = project.furnitureLayouts.find((l) => l.id === layoutId)?.name ?? ''
  const name = nameOverride ?? defaultExportName(project.name, layoutName)

  const hasSelection = selectedIds.length > 0
  // A selection that was cleared (or a stage that went away) while the dialog
  // is open must not leave a now-unavailable area chosen.
  const effectiveArea: ExportArea =
    (area === 'selection' && !hasSelection) || (area === 'view' && !viewport) ? 'content' : area

  // Modal keyboard handling, as ShortcutSheet does it: a capture-phase window
  // listener runs ahead of the app's own (bubble-phase) key handlers, so
  // Delete or Ctrl+Z cannot reach the canvas behind the dialog, and Escape
  // closes this without also cancelling a room being drawn. Keys aimed at a
  // field are left to flow on to it (the file name's Enter handling needs
  // them); the canvas's handler already ignores typing targets.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        hide()
        return
      }
      if (isTypingTarget(e.target)) return
      e.stopPropagation()
      // Keep Ctrl+S / Ctrl+= from reaching the browser's own binding.
      if ((e.ctrlKey || e.metaKey) && findShortcut(e, 'global')) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [hide])

  useEffect(() => {
    const previous = document.activeElement
    dialogRef.current?.focus()
    return () => {
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])

  const rect = useMemo<WorldRect | null>(() => {
    const include = {
      rooms: showLayers.rooms,
      furniture: showLayers.furniture,
      referenceImages: includeImages && showLayers.referenceImages,
      annotations: includeAnnotations && showLayers.annotations,
    }
    if (effectiveArea === 'view') {
      if (!viewport) return null
      return viewRect(view, viewport.width, viewport.height, BASE_PIXELS_PER_UNIT * view.scale)
    }
    const bounds = contentBounds(
      project,
      layoutId,
      include,
      effectiveArea === 'selection' ? new Set(selectedIds) : undefined,
    )
    return bounds ? padRect(bounds, exportMargin(settings.units)) : null
  }, [
    effectiveArea,
    project,
    layoutId,
    showLayers,
    includeImages,
    includeAnnotations,
    selectedIds,
    view,
    viewport,
    settings.units,
  ])

  // Layers get the zoom the live canvas would have: the real one for "current
  // view", 1 otherwise, so a fit-to-content export is the same drawing as the
  // canvas at 100%.
  const zoom = effectiveArea === 'view' ? view.scale : 1
  const ppu = BASE_PIXELS_PER_UNIT * zoom
  // The area in layer pixels (the size of the image at 1x).
  const baseWidth = rect ? rect.width * ppu : 0
  const baseHeight = rect ? rect.height * ppu : 0

  const size = rect ? fitExportSize(baseWidth, baseHeight, scale) : null
  const scaleSizes = useMemo(
    () =>
      EXPORT_SCALES.map((s) => ({
        scale: s,
        size: rect ? fitExportSize(baseWidth, baseHeight, s) : null,
      })),
    [rect, baseWidth, baseHeight],
  )

  // Preview shrink factor: layer pixels -> preview pixels. Never enlarges, so
  // a small plan is shown at its true 1x size rather than blown up.
  const previewScale = rect
    ? Math.min(previewBox.width / baseWidth, previewBox.height / baseHeight, 1)
    : 1
  const stageWidth = Math.max(1, Math.ceil(baseWidth * previewScale))
  const stageHeight = Math.max(1, Math.ceil(baseHeight * previewScale))

  const backgroundColor = resolveBackground(background, settings.backgroundColor, customColor)

  function handleExport() {
    const stage = stageRef.current
    if (!stage || !rect || !size) return
    // toDataURL's canvas is `width * pixelRatio` wide and the browser
    // truncates fractions, so the ratio is nudged up by a part in a billion:
    // a product that should be exactly 4800 but computes as 4799.999999999 would
    // otherwise lose a column. Output sides are floored in fitExportSize, so
    // the nudge can only recover that column, never add one.
    const pixelRatio = (size.scale / previewScale) * (1 + 1e-9)
    let dataUrl = ''
    try {
      dataUrl = stage.toDataURL({
        x: 0,
        y: 0,
        width: baseWidth * previewScale,
        height: baseHeight * previewScale,
        pixelRatio,
      })
    } catch {
      dataUrl = ''
    }
    // A canvas the browser refused to allocate comes back as the empty
    // "data:," URL rather than throwing; say so instead of saving nothing.
    if (dataUrl.length < 64) {
      window.alert(
        'The browser could not render an image this large. Choose a lower resolution or a smaller area and try again.',
      )
      return
    }
    downloadDataUrl(dataUrl, pngFilename(name))
    hide()
  }

  const filenameForDisplay = pngFilename(name)
  const canExport = rect !== null && size !== null

  return (
    <Overlay onClose={hide} className={styles.overlay} contentClassName={styles.modal}>
      <div className={styles.header}>
        <span>Export as PNG</span>
        <button className={styles.closeButton} onClick={hide} aria-label="Close">
          ×
        </button>
      </div>
      <div
        ref={dialogRef}
        className={styles.body}
        role="dialog"
        aria-modal="true"
        aria-label="Export as PNG"
        tabIndex={-1}
      >
        <div className={styles.previewColumn}>
          <div className={styles.previewWell}>
            {rect && size ? (
              <div className={backgroundColor === null ? styles.checker : undefined}>
                <div className={styles.stageFrame}>
                  <Stage
                    ref={stageRef}
                    width={stageWidth}
                    height={stageHeight}
                    x={-rect.x * ppu * previewScale}
                    y={-rect.y * ppu * previewScale}
                    scaleX={previewScale}
                    scaleY={previewScale}
                    listening={false}
                  >
                    {/* Always its own layer, drawn first, so layer order
                     * matches the live canvas. Omitted entirely for a
                     * transparent export. */}
                    {backgroundColor !== null && (
                      <Layer listening={false}>
                        <Rect
                          x={rect.x * ppu - EDGE_SLACK / 2}
                          y={rect.y * ppu - EDGE_SLACK / 2}
                          width={baseWidth + EDGE_SLACK}
                          height={baseHeight + EDGE_SLACK}
                          fill={backgroundColor}
                        />
                      </Layer>
                    )}
                    {includeGrid && (
                      <GridLayer
                        pixelsPerUnit={ppu}
                        gridSize={settings.gridSize}
                        viewX={-rect.x * ppu}
                        viewY={-rect.y * ppu}
                        zoom={zoom}
                        width={baseWidth + EDGE_SLACK}
                        height={baseHeight + EDGE_SLACK}
                        units={settings.units}
                        rulerMode={settings.rulerMode}
                      />
                    )}
                    {includeImages && <ReferenceImageLayer pixelsPerUnit={ppu} />}
                    <RoomLayer pixelsPerUnit={ppu} />
                    <InteriorWallLayer pixelsPerUnit={ppu} units={settings.units} />
                    <FurnitureLayer pixelsPerUnit={ppu} layoutId={layoutId} />
                    {includeAnnotations && <AnnotationLayer />}
                  </Stage>
                </div>
              </div>
            ) : (
              <div className={styles.emptyPreview}>
                {effectiveArea === 'selection'
                  ? 'The selection has nothing to export with the current options.'
                  : 'Nothing to export yet. Draw a room or place furniture first.'}
              </div>
            )}
          </div>
          <div className={styles.summary}>
            {size ? `${size.width} x ${size.height} px` : 'No image'}
            {size && size.capped && ` (requested ${scale}x)`}
          </div>
          {size && size.capped && (
            <div className={styles.warning}>
              This area is too large for the browser at {scale}x, so the image is exported at{' '}
              {formatScale(size.scale)}x instead (limit {MAX_EXPORT_SIDE} px per side and{' '}
              {MAX_EXPORT_PIXELS / 1_000_000} megapixels). Pick a smaller area to export at a higher
              resolution.
            </div>
          )}
        </div>

        <div className={styles.options}>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Area</div>
            <RadioChoice
              name="export-area"
              value="content"
              current={effectiveArea}
              onSelect={setArea}
              label="Fit to content"
            />
            <RadioChoice
              name="export-area"
              value="view"
              current={effectiveArea}
              onSelect={setArea}
              label="Current view"
              disabled={!viewport}
            />
            <RadioChoice
              name="export-area"
              value="selection"
              current={effectiveArea}
              onSelect={setArea}
              label="Selection only"
              note={hasSelection ? undefined : '(nothing selected)'}
              disabled={!hasSelection}
            />
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Include</div>
            <CheckChoice label="Grid" checked={includeGrid} onChange={setIncludeGrid} />
            <CheckChoice label="Reference images" checked={includeImages} onChange={setIncludeImages} />
            <CheckChoice label="Annotations" checked={includeAnnotations} onChange={setIncludeAnnotations} />
            <div className={styles.hint}>
              Layers hidden in the Layers panel stay hidden in the export.
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Background</div>
            <label className={styles.choice}>
              <input
                type="radio"
                name="export-background"
                checked={background === 'project'}
                onChange={() => setBackground('project')}
              />
              <span className={styles.swatch} style={{ background: settings.backgroundColor }} />
              Project color
            </label>
            <RadioChoice
              name="export-background"
              value="white"
              current={background}
              onSelect={setBackground}
              label="White"
            />
            <RadioChoice
              name="export-background"
              value="transparent"
              current={background}
              onSelect={setBackground}
              label="Transparent"
            />
            <label className={styles.choice}>
              <input
                type="radio"
                name="export-background"
                checked={background === 'custom'}
                onChange={() => setBackground('custom')}
              />
              Custom
              <input
                className={styles.colorInput}
                type="color"
                value={customColor}
                aria-label="Custom background color"
                onChange={(e) => {
                  setCustomColor(e.target.value)
                  setBackground('custom')
                }}
              />
            </label>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Resolution</div>
            {scaleSizes.map(({ scale: s, size: sz }) => (
              <label key={s} className={styles.choice}>
                <input
                  type="radio"
                  name="export-scale"
                  checked={scale === s}
                  onChange={() => setScale(s)}
                />
                {s}x
                <span className={styles.choiceNote}>
                  {sz ? `${sz.width} x ${sz.height} px${sz.capped ? ' (capped)' : ''}` : ''}
                </span>
              </label>
            ))}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Layout</div>
            <select
              className={styles.select}
              value={layoutId}
              aria-label="Furniture layout to export"
              onChange={(e) => setLayoutId(e.target.value)}
            >
              {project.furnitureLayouts.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {l.id === activeLayoutId ? ' (active)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>File name</div>
            <div className={styles.nameRow}>
              <input
                className={styles.input}
                type="text"
                value={name}
                aria-label="File name"
                onChange={(e) => setNameOverride(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canExport) handleExport()
                }}
              />
              <span className={styles.extension}>.png</span>
            </div>
            <div className={styles.hint}>Saves as {filenameForDisplay}</div>
          </div>

          <div className={styles.actions}>
            <button className={styles.button} onClick={handleExport} disabled={!canExport}>
              Export
            </button>
            <button className={styles.secondaryButton} onClick={hide}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  )
}

function formatScale(scale: number): string {
  return scale >= 1 ? scale.toFixed(1) : scale.toFixed(2)
}

interface RadioChoiceProps<T extends string> {
  name: string
  value: T
  current: T
  onSelect: (value: T) => void
  label: string
  note?: string
  disabled?: boolean
}

function RadioChoice<T extends string>({
  name,
  value,
  current,
  onSelect,
  label,
  note,
  disabled,
}: RadioChoiceProps<T>) {
  return (
    <label className={disabled ? styles.choiceDisabled : styles.choice}>
      <input
        type="radio"
        name={name}
        checked={current === value}
        disabled={disabled}
        onChange={() => onSelect(value)}
      />
      {label}
      {note && <span className={styles.choiceNote}>{note}</span>}
    </label>
  )
}

function CheckChoice({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className={styles.choice}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}
