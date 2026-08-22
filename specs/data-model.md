# Mover — Data Model

All types are TypeScript. All dimensions are in **real-world units** (inches or cm depending on project setting). Pixel conversions happen at render time only.

---

## Project (root)

```ts
interface Project {
  version: string              // file format version, currently "1.1"
  id: string                   // uuid
  name: string
  created: string              // ISO 8601
  modified: string             // ISO 8601

  settings: ProjectSettings
  rooms: Room[]
  interiorWalls: InteriorWall[]
  furnitureLayouts: FurnitureLayout[]         // furniture arrangements (see Furniture layouts)
  activeFurnitureLayoutId: string             // the layout the tools edit
  customFurnitureDefs: FurnitureDefinition[]  // the user's saved pieces (see Furniture sets)
  furnitureSets: FurnitureSet[]               // the sets those pieces are filed under
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
  // The two ends of the measuring line the user drew across the photo, and how
  // long that line is in the real world. Together they set the image's scale.
  p1: Point                   // WORLD-space, not image-local pixels
  p2: Point                   // WORLD-space
  realWorldDistance: number    // in project units
}
```

Notes on `ImageCalibration`:

- `p1`/`p2` are **world-space** points in project units, captured when the user drew the calibration line — not coordinates within the source bitmap.
- After a calibration is applied, `distance(p1, p2) === realWorldDistance`. Every operation that rescales an image maintains that invariant: `calibrationPatch` stores the post-scale `p2`, and a manual resize in the Properties panel scales `p1`, `p2`, and `realWorldDistance` by the same factor.
- Because they are world-space, they translate with the image when it is dragged (see `SelectTool`'s multi-drag commit).
- `p1` is the fixed anchor when (re)calibration rescales the image: it is a feature the user deliberately clicked on, so it is the one point that should not move under them.

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

The built-in catalog is a static JSON file (`src/furniture/catalog.json`) that ships with the app. It is never stored in the project file — only `customFurnitureDefs` (user-created) are persisted. Instances reference definitions by `definitionId`; if the ID is not found in the built-in catalog, it falls back to `customFurnitureDefs`. Built-ins always win a collision, so a saved piece can never shadow a catalog entry.

---

## Furniture sets (user library)

A **piece** is a `FurnitureDefinition` the user saved from a placed item, capturing its width, depth, `fillColor` and name. A **set** is the named group a piece is filed under:

```ts
interface FurnitureSet {
  id: string
  name: string
}
```

Membership lives on the piece rather than nesting pieces inside sets, which keeps definition lookup a single flat search over `customFurnitureDefs`. A piece whose `setId` is missing or names no known set shows under "Ungrouped".

`FurnitureDefinition` gains two optional fields, both unset on built-ins:

| Field | Meaning |
|-------|---------|
| `fillColor?` | Color captured from the source instance; built-ins fall back to `CATEGORY_COLORS[category]` |
| `setId?` | Owning set |

**Storage is dual.** The library lives in `localStorage` under `mover:furniture-library` (`{ version, sets, pieces }`), shared by every project in the browser, and a copy is embedded in each saved project file so a shared `.mover.json` renders its own pieces. Opening a project merges its copy into the browser library by id, with the browser library winning every collision — so re-opening a file can never duplicate a set. The embed is written at serialization time only, so editing the library never marks the project dirty and never pushes a history snapshot.

**The library is outside undo.** `historyStore` snapshots whole `Project` objects, which the library is not part of; deleting a set or a piece confirms instead of being undoable.

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

## Furniture layouts (variants)

A **furniture layout** is one named arrangement of furniture over the project's rooms — a variant of the plan the user can compare against the others.

```ts
interface FurnitureLayout {
  id: string
  name: string
  furnitureInstances: FurnitureInstance[]
}
```

**Only furniture is per-layout.** Rooms, interior walls, reference images and annotations stay on the `Project` and are shared by every layout, because the feature exists to try different arrangements *of the same space*: a variant that could also move the walls would be a separate project, not a comparable alternative.

**A project always has at least one layout.** `projectStore.removeFurnitureLayout` refuses to delete the last one, and the loader backfills one for any file that arrives without them, so there is always somewhere to place furniture.

`activeFurnitureLayoutId` names the layout the tools read and write. Every furniture read in the app goes through `project/layouts.ts` (`activeFurnitureInstances`, or `layoutFurniture` for a read-only comparison pane) rather than reaching into the project, so "which layout am I looking at" is decided in one place. An id naming no layout falls back to the first one, and the loader normalizes it on open.

**Instance ids are unique across layouts.** Duplicating a layout re-ids every instance it copies: entity ids are the currency of selection and deletion, so two layouts sharing an instance id would let a delete in one silently hit the other.

**Selection is effectively per-layout.** `uiStore.selectedIds` holds entity ids and is cleared whenever the active layout changes (`project/layoutActions.ts`), so the properties panel, the highlight layer and Delete only ever act on what is on screen. Undo/redo clear it for the same reason — a restored snapshot may carry a different active layout.

Creating, duplicating, renaming and deleting a layout push a history snapshot and are undoable. *Switching* layouts does not: it is navigation, and an undo step there would sit between the user and the edit they actually want to take back.

### Comparison view

Compare mode (`uiStore.compareMode` / `comparedLayoutIds`) draws the checked layouts side by side. It is view state, not project state — it is not saved and does not travel with a shared `.mover.json`.

Exactly one pane is live: the active layout keeps the real `LayoutCanvas` (tools, selection, drag, rulers) and the others are read-only `ComparisonPane`s. Clicking a read-only pane makes that layout active, handing the editable canvas over to it. Selection, drag state and the active tool are single-valued in `uiStore`, so two live canvases would either fight over that state or need it duplicated per layout; one live pane keeps a single interaction model. Every pane renders through the same `uiStore.view`, so panning or zooming moves them together — panes showing different parts of the plan would not be comparable.

---

## File Versioning

The `version` field follows semver. Breaking changes to the schema bump the major version. The loader checks `version` on open and applies migrations for older files.

| Version | Change |
|---------|--------|
| `1.0` | Initial schema; furniture in a single flat `Project.furnitureInstances` array |
| `1.1` | Furniture moved into `furnitureLayouts` + `activeFurnitureLayoutId` (L1) |

`parseProject` accepts every version in `SUPPORTED_PROJECT_VERSIONS`, migrates it forward, and re-stamps it as the current version — so a `1.0` file opens with its furniture wrapped in one default layout named "Layout 1", and saves back as `1.1`. The bump is what makes an older build refuse a newer file outright rather than opening it and silently showing no furniture.
