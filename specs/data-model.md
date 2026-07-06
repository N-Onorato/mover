# Mover — Data Model

All types are TypeScript. All dimensions are in **real-world units** (inches or cm depending on project setting). Pixel conversions happen at render time only.

---

## Project (root)

```ts
interface Project {
  version: string              // file format version, e.g. "1.0"
  id: string                   // uuid
  name: string
  created: string              // ISO 8601
  modified: string             // ISO 8601

  settings: ProjectSettings
  rooms: Room[]
  furnitureInstances: FurnitureInstance[]
  customFurnitureDefs: FurnitureDefinition[]
  referenceImages: ReferenceImage[]
  annotations: Annotation[]
}
```

---

## ProjectSettings

```ts
interface ProjectSettings {
  units: 'imperial' | 'metric'   // inches vs cm
  gridSize: number               // in units (e.g. 12 for 1 foot)
  snapToGrid: boolean
  snapToWalls: boolean
  defaultWallThickness: number   // in units
  backgroundColor: string        // CSS color
}
```

---

## Room

Rooms are defined by a polygon of points. A rectangular room is 4 points. Walls are the edges between consecutive points (plus the closing edge).

```ts
interface Room {
  id: string
  name: string
  points: Point[]              // polygon vertices in world space
  wallThickness: number        // in units
  fillColor: string            // CSS color or 'transparent'
  wallColor: string            // CSS color
  locked: boolean
  visible: boolean
}

interface Point {
  x: number
  y: number
}
```

---

## Furniture

### FurnitureDefinition (catalog entry or custom)

Defines a furniture type — shared between all instances of that piece.

```ts
interface FurnitureDefinition {
  id: string
  name: string
  category: FurnitureCategory
  width: number                // real-world width in units
  depth: number                // real-world depth in units
  shape: FurnitureShape
  tags: string[]               // for catalog search
  builtIn: boolean             // true = shipped with app, false = user-created
}

type FurnitureCategory =
  | 'seating'
  | 'tables'
  | 'storage'
  | 'beds'
  | 'appliances'
  | 'bathroom'
  | 'office'
  | 'lighting'
  | 'other'

type FurnitureShape =
  | { type: 'rect' }                        // default: use width x depth
  | { type: 'path'; d: string }             // SVG path string, normalized to 1x1 unit box

// All built-in catalog shapes use hand-authored SVG paths for silhouette fidelity.
// Paths are normalized to a 1×1 viewBox; the renderer scales to the instance's
// real-world width × depth. Custom user definitions may use 'rect' or 'path'.
```

### FurnitureInstance (placed on canvas)

One specific piece placed in the layout.

```ts
interface FurnitureInstance {
  id: string
  definitionId: string         // references FurnitureDefinition.id
  x: number                   // world position (top-left of bounding box)
  y: number
  width: number                // can differ from definition (user resized)
  depth: number
  rotation: number             // degrees, clockwise
  fillColor: string            // CSS color
  label: string | null         // optional override label
  locked: boolean
  visible: boolean
}
```

---

## Reference Image

```ts
interface ReferenceImage {
  id: string
  name: string
  src: string                  // base64 data URI (embedded in file)
  x: number                   // world position of top-left
  y: number
  width: number                // display width in world units
  height: number               // display height in world units
  rotation: number             // degrees
  opacity: number              // 0.0 – 1.0
  locked: boolean
  visible: boolean
  calibration: ImageCalibration | null
}

interface ImageCalibration {
  // Two points in image-local pixel space and the real-world distance between them.
  // Used to derive the image's world-space dimensions on import.
  p1: Point                   // pixel coords within source image
  p2: Point
  realWorldDistance: number    // in project units
}
```

---

## Annotations

```ts
type Annotation = TextLabel | DimensionLine

interface TextLabel {
  type: 'text'
  id: string
  x: number
  y: number
  text: string
  fontSize: number             // in points
  color: string
  rotation: number
}

interface DimensionLine {
  type: 'dimension'
  id: string
  p1: Point
  p2: Point
  offset: number               // how far the line sits from the measured edge, in units
  unit: 'project' | 'override' // 'override' means use displayUnit below
  displayUnit?: 'in' | 'ft' | 'cm' | 'm'
  color: string
}
```

---

## Catalog (built-in)

The built-in catalog is a static JSON file (`src/furniture/catalog.json`) that ships with the app. It is never stored in the project file — only `customFurnitureDefs` (user-created) are persisted. Instances reference definitions by `definitionId`; if the ID is not found in the built-in catalog, it falls back to `customFurnitureDefs`.

### Initial catalog pieces (v1)

| Category | Pieces |
|----------|--------|
| Seating | Sofa (2-seat), Sofa (3-seat), Armchair, Dining chair, Office chair |
| Tables | Coffee table, Dining table (4-person), Dining table (6-person), Desk, Nightstand |
| Beds | Twin, Full, Queen, King |
| Storage | Dresser, Wardrobe, Bookshelf, TV stand |
| Appliances | Refrigerator, Stove/range, Dishwasher, Washer, Dryer |
| Bathroom | Toilet, Sink (pedestal), Bathtub, Shower stall |

---

## File Versioning

The `version` field follows semver. Breaking changes to the schema bump the major version. The loader checks `version` on open and can apply migrations for older files.
