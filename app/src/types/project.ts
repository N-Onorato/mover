export interface Point {
  x: number
  y: number
}

/** Current on-disk schema version, written by every save.
 *
 * 1.1 (L1) replaced the flat `Project.furnitureInstances` array with
 * `furnitureLayouts` + `activeFurnitureLayoutId`. The bump is what makes an
 * older build refuse a newer file outright ("Unsupported project version")
 * instead of opening it and silently showing no furniture. */
export const PROJECT_VERSION = '1.1'

/** Versions `parseProject` accepts. Older entries are migrated forward on
 * load (io/load.ts) and re-saved as PROJECT_VERSION. */
export const SUPPORTED_PROJECT_VERSIONS: readonly string[] = ['1.0', PROJECT_VERSION]

export interface Project {
  version: string
  id: string
  name: string
  created: string
  modified: string
  settings: ProjectSettings
  rooms: Room[]
  interiorWalls: InteriorWall[]
  /** Furniture arrangements over the shared room shell. Always at least one -
   * the store refuses to delete the last, and load.ts backfills a default
   * from a pre-1.1 flat `furnitureInstances` array. */
  furnitureLayouts: FurnitureLayout[]
  /** Which layout is rendered on the main canvas and edited by the tools.
   * A dangling id falls back to the first layout (see project/layouts.ts). */
  activeFurnitureLayoutId: string
  customFurnitureDefs: FurnitureDefinition[]
  furnitureSets: FurnitureSet[]
  referenceImages: ReferenceImage[]
  annotations: Annotation[]
}

/** L1 (#28): one named furniture arrangement - a "variant" of the plan.
 *
 * Layouts hold furniture only. Rooms, interior walls, reference images and
 * annotations stay on the Project and are shared by every layout, because the
 * point of the feature is trying different arrangements *of the same space*:
 * a variant that could also move the walls would be a separate project, not a
 * comparable alternative. */
export interface FurnitureLayout {
  id: string
  name: string
  furnitureInstances: FurnitureInstance[]
}

export interface ProjectSettings {
  units: 'imperial' | 'metric'
  gridSize: number
  snapToGrid: boolean
  snapToWalls: boolean
  defaultWallThickness: number
  backgroundColor: string
  rulerMode: 'feet-inches' | 'simple'
}

export interface Room {
  id: string
  name: string
  points: Point[]
  wallThickness: number
  fillColor: string
  wallColor: string
  locked: boolean
  visible: boolean
}

export interface InteriorWall {
  id: string
  roomId: string
  a: Point
  b: Point
  thickness: number
  locked: boolean
  visible: boolean
}

export type FurnitureCategory =
  | 'seating'
  | 'tables'
  | 'storage'
  | 'beds'
  | 'appliances'
  | 'bathroom'
  | 'office'
  | 'lighting'
  | 'other'

export type FurnitureShape =
  | { type: 'rect' }
  | { type: 'path'; d: string }

export interface FurnitureDefinition {
  id: string
  name: string
  category: FurnitureCategory
  width: number
  depth: number
  shape: FurnitureShape
  tags: string[]
  builtIn: boolean
  /** Saved appearance for user-created pieces. Built-ins leave this unset and
   * fall back to CATEGORY_COLORS. */
  fillColor?: string
  /** Owning furniture set for user-created pieces. Missing or dangling ids
   * render under "Ungrouped". */
  setId?: string
}

/** Named group of user-saved furniture pieces. Set membership lives on the
 * piece (`FurnitureDefinition.setId`) so definition lookup stays a flat
 * search; this carries only the set's identity and name. */
export interface FurnitureSet {
  id: string
  name: string
}

export interface FurnitureInstance {
  id: string
  definitionId: string
  x: number
  y: number
  width: number
  depth: number
  rotation: number
  fillColor: string
  label: string | null
  locked: boolean
  visible: boolean
}

export interface ImageCalibration {
  p1: Point
  p2: Point
  realWorldDistance: number
}

export interface ReferenceImage {
  id: string
  name: string
  src: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  locked: boolean
  visible: boolean
  calibration: ImageCalibration | null
}

export interface TextLabel {
  type: 'text'
  id: string
  x: number
  y: number
  text: string
  fontSize: number
  color: string
  rotation: number
}

export interface DimensionLine {
  type: 'dimension'
  id: string
  p1: Point
  p2: Point
  offset: number
  unit: 'project' | 'override'
  displayUnit?: 'in' | 'ft' | 'cm' | 'm'
  color: string
}

export type Annotation = TextLabel | DimensionLine
