export interface Point {
  x: number
  y: number
}

export interface Project {
  version: string
  id: string
  name: string
  created: string
  modified: string
  settings: ProjectSettings
  rooms: Room[]
  interiorWalls: InteriorWall[]
  furnitureInstances: FurnitureInstance[]
  customFurnitureDefs: FurnitureDefinition[]
  referenceImages: ReferenceImage[]
  annotations: Annotation[]
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
