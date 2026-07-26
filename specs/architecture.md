# Mover — Architecture

## Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Language | TypeScript | Type safety essential for a data-heavy canvas app |
| Framework | React 19 | Wide ecosystem, good devtools, team familiarity |
| Build tool | Vite | Fast HMR, simple config, great TS support |
| Canvas | Konva.js + react-konva | Best-in-class interactive 2D canvas; handles hit detection, drag, transforms, and layering natively |
| State | Zustand | Simple, no boilerplate, works well outside React render cycle (needed for canvas event handlers) |
| Styling | CSS Modules | Scoped styles, no runtime cost, no framework lock-in |
| File I/O | Browser File System API + `<input type="file">` | No server needed; fallback input for broad compatibility |

### Why Konva over SVG or raw Canvas?

SVG DOM becomes slow past ~500 elements and doesn't handle transforms/hit-testing as cleanly. Raw Canvas requires reimplementing object selection, drag, and layering from scratch. Konva provides a retained-mode scene graph on top of Canvas with built-in drag, transforms, and hit detection — exactly what a layout tool needs.

---

## Application Structure

```
src/
  main.tsx                  # Entry point
  App.tsx                   # Root layout: sidebar + canvas area + toolbar

  store/
    projectStore.ts         # Zustand store: rooms, furniture, images, history
    uiStore.ts              # Active tool, selection, panel visibility
    historyStore.ts         # Undo/redo stack

  canvas/
    LayoutCanvas.tsx        # Konva Stage + Layer composition
    layers/
      ReferenceImageLayer.tsx
      RoomLayer.tsx
      FurnitureLayer.tsx
      AnnotationLayer.tsx
      SelectionLayer.tsx    # Selection box, handles
    tools/
      SelectTool.ts
      RoomTool.ts           # Room drawing state machine
      FurnitureTool.ts      # Drag-from-panel placement
      ImageTool.ts          # Reference image transforms
      AnnotationTool.ts

  components/
    Toolbar.tsx             # Tool switcher, zoom controls
    CatalogPanel.tsx        # Furniture browser + search
    LayerPanel.tsx          # Layer visibility/lock toggles
    PropertiesPanel.tsx     # Selected item properties (dimensions, rotation, color)
    SettingsModal.tsx

  furniture/
    catalog.ts              # Built-in furniture definitions (JSON)
    types.ts                # FurnitureDefinition type
    CustomFurnitureForm.tsx # Create/edit custom furniture

  io/
    save.ts                 # Serialize project to JSON
    load.ts                 # Deserialize + validate
    exportPng.ts
    exportSvg.ts

  utils/
    geometry.ts             # Point, Rect, Polygon math
    scale.ts                # Real-world <-> pixel conversions
    snap.ts                 # Grid and wall snap logic
    units.ts                # Imperial/metric formatting

  types/
    project.ts              # Project, Room, FurnitureInstance, etc.
```

---

## Rendering Architecture

The canvas is a Konva `Stage` composed of fixed layers in z-order:

```
Stage
  Layer: reference-images   (locked by default)
  Layer: rooms
  Layer: furniture
  Layer: annotations
  Layer: ui-overlay         (selection handles, in-progress drawing, dimension preview)
```

Each layer maps to a Zustand slice. Canvas items are Konva `Group` or `Shape` nodes driven by the store — no local state in canvas components. When the store updates, the relevant layer re-renders.

### Click priority

Layer order also defines selection priority: **the topmost unlocked, visible layer under the cursor wins a click.** `SelectTool.onPointerDown` therefore hit-tests in the reverse of paint order — furniture, then room vertices/edges, then interior walls, then room bodies, then reference images — returning on the first match.

The case worth calling out is a reference image under a room, which is the normal state of affairs since images are imported to trace rooms over. While the rooms layer is unlocked, clicks in that overlap select the room. This depends only on which layers are unlocked, never on where inside the shape the click lands. Two deterministic ways to reach a covered image: lock the Rooms layer, or marquee-select it (`onPointerUp` unions matches across all entity types rather than taking the first hit, so z-order does not apply).

Reference images ship with their layer locked by default — a tracing photo should not be grabbable while you draw over it.

---

## Tool State Machine

Each tool is a plain TypeScript object/class with `onMouseDown`, `onMouseMove`, `onMouseUp`, and `onKeyDown` handlers. The active tool receives canvas pointer events from `LayoutCanvas`. Tools dispatch to the Zustand store on commit (e.g., room closed, furniture dropped).

This keeps tool logic entirely outside React, making it easy to test and swap.

---

## Coordinate System

- **Screen space**: pixels, origin top-left, used by Konva internally
- **World space**: real-world units (inches or cm), used in the data model
- **Scale factor**: `pixelsPerUnit` — configurable, defaults to 10px per inch at 100% zoom

All data is stored in world space. The `scale.ts` module converts at render time and on pointer events.

---

## History (Undo/Redo)

Zustand store state is snapshotted on every committed action (not on in-progress drags). The history stack holds up to 50 full project-state snapshots. Snapshotting the full state is simple and correct; at typical project sizes (< 1MB JSON) it is fast enough.

If performance becomes an issue, switch to a command-pattern (store diffs, not full state) — the interface stays the same.

---

## File Format

Projects are saved as `.mover.json` — a serialized `Project` object (see `specs/data-model.md`). Reference images are embedded as base64 data URIs so the file is fully self-contained.

---

## Deployment

- Static HTML/JS/CSS — no server required
- Can be opened as a local `index.html` file (with Vite's `base: './'` config)
- CI: GitHub Actions builds and deploys to GitHub Pages on push to `main`
