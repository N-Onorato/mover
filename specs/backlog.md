# Backlog: usability fixes from dogfooding (notes.md, 2026-07-10)

Source: root `notes.md`, first hands-on pass through the app. Each item below is
grounded against the current `app/src` implementation (verified 2026-07-10),
grouped by theme, and ordered so earlier groups unblock later ones.

## Group A — Measurement foundation

Everything else in this list either displays a length or reads one back from
the user, so get the parsing/formatting primitives right first.

### A1. Flexible unit input parsing
**Priority: P0**

Today there's no shared parser — `ImageTool.ts` reads calibration length via a
bare `window.prompt` + `parseFloat` (`finishCalibration`, `app/src/canvas/tools/ImageTool.ts:57-58`),
and any future numeric dimension field would have to invent its own parsing.

Acceptance criteria:
- A single utility (e.g. `utils/units.ts: parseLength`) accepts imperial input
  in any of these forms and returns inches as a number:
  - `6"`, `6 in`, `6 inches`
  - `6'`, `6 ft`, `6 feet`
  - `7'3"`, `7' 3"`, `7ft 3in`, `7-3` (feet-dash-inches)
  - bare numbers (e.g. `72`) are interpreted using the project's default unit
- Fractional inches are accepted (`7' 3.5"`, `6 1/2"`).
- Invalid input (unparseable string, negative length, zero for a required
  field) is rejected with an inline error, not a silent fallback to 0 or NaN.
- Metric mode accepts `cm`, `m`, `6.5m`, `320` (bare = cm).
- Unit tests cover every format above plus at least 3 malformed-input cases.
- Any place currently taking a raw number for a length (calibration prompt,
  future dimension fields) is switched to use this parser instead of
  `parseFloat`.

### A2. Simplified, configurable ruler scale
**Priority: P0**

Current ruler (`canvas/Rulers.tsx`, `utils/gridRuler.ts`) already reads a
`UnitSystem` and calls `formatLength`, but grid spacing comes from
`adaptiveGridSize` with no unit-aware "feet with inch subdivisions" mode, and
there's no per-project setting for it.

Acceptance criteria:
- Project settings gain a ruler/grid display mode; default is "feet, with
  inch sub-grid at high zoom."
- At low zoom, only foot marks are labeled (no inch clutter).
- Past a defined zoom threshold, minor ticks subdivide into inches
  (12 per foot) and every Nth minor tick (e.g. every 6") gets a light label.
- The mode is a per-project setting (persisted in `.mover.json`), overridable
  by the user, not hardcoded.
- Metric projects keep the existing cm/m behavior unaffected.

## Group B — Reference image calibration

### B1. Calibration line placement ignores grid snap
**Priority: P0**

`LayoutCanvas.tsx` snaps every world point via `snapToGrid` before it reaches
any tool (`app/src/canvas/LayoutCanvas.tsx:103-105`), including the two clicks
`ImageTool.onPointerDown` collects for calibration. This forces calibration
endpoints onto grid intersections even though the reference photo's real
features (e.g. a door edge) rarely land there.

Acceptance criteria:
- While `activeTool === 'image'` and a calibration is in progress, pointer
  positions passed to the tool are the raw (un-snapped) world coordinates.
- Grid snap continues to apply normally for every other tool (room, furniture,
  annotation, select).
- The calibration prompt for real-world length uses the parser from A1
  instead of `parseFloat`, so `7'3"` works directly.
- Manually verified: importing an image, zooming in, and clicking two
  non-grid-aligned points on the photo places the calibration markers exactly
  where clicked.

## Group C — Selection & direct manipulation

These are the biggest functional gaps: `SelectTool.ts` only ever selects (its
`onPointerMove`/`onPointerUp` are no-ops), so nothing on canvas can currently
be repositioned by dragging.

### C1. Drag-to-select (marquee selection)
**Priority: P1**

Acceptance criteria:
- Pointer-down on empty canvas space with the select tool active, followed by
  drag, shows a live marquee rectangle (visual feedback layer, e.g. added to
  `SelectionLayer.tsx`).
- On pointer-up, every room whose points are fully (or, if simpler for v1,
  partially — pick one and document it) inside the marquee is added to
  selection.
- A plain click (no drag) still preserves today's single-select / deselect
  behavior — marquee logic must not regress `onPointerDown`'s existing
  edge/room hit-testing in `SelectTool.ts:22-48`.
- Shift-drag adds to the existing selection instead of replacing it.
- Marquee selection respects `lockedLayers.rooms` (locked layer = not
  selectable), matching current behavior.

### C2. Click-and-drag walls
**Priority: P1**

`SelectTool.ts` already computes `setSelectedWall({ roomId, edgeIndex })` on
click (line 32) but nothing consumes that state to let the user drag the wall.
Room reshaping strategy per project memory: support both vertex-drag (move a
corner) and wall-segment-drag (slide an edge parallel to itself).

Acceptance criteria:
- Clicking and dragging a selected wall (edge) moves that edge parallel to
  itself, updating the two adjacent vertices; the room's other walls do not
  move.
- Clicking and dragging a vertex (corner) moves just that point, reshaping
  the two walls that meet there.
- Drag preview updates live on every pointer move; the undo snapshot is
  pushed once on pointer-up (consistent with existing "one step per committed
  action" rule, not mid-drag).
- Dragging respects grid snap settings the same way room drawing does.
- Locked rooms/layers cannot be dragged.

## Group D — Live feedback while editing

### D1. Dynamic wall length labels
**Priority: P2**

`RoomLayer.tsx` currently renders only the room name as a `<Text>` (line 30);
no per-wall length is shown anywhere, static or dynamic.

Acceptance criteria:
- Each wall segment of a room shows its length (via `formatLength`,
  respecting the project's unit system) centered on the segment, rotated to
  match the wall's angle.
- Labels update live while drawing a room (`RoomTool`'s in-progress
  `drawingState.points`) and while dragging a wall/vertex (depends on C2).
- Labels can be toggled off via layer visibility or a settings flag, since
  they'll add visual noise on small rooms with many walls — pick one
  mechanism and document it.
- Labels don't overlap room name label at typical zoom levels (basic
  collision avoidance, e.g. offset from centroid).

### D2. Bottom status/info bar
**Priority: P2**

No status bar or info bar component exists anywhere in `app/src` today —
this is entirely new UI.

Acceptance criteria:
- A persistent bar docked to the bottom of the canvas viewport shows, at
  minimum:
  - Current tool name and, when it's mid-operation, a short hint of what
    input it's waiting for (e.g. "Room: click to add point, double-click to
    close" / "Calibration: click second point").
  - Total square footage of all rooms in the project (sum of polygon areas,
    converted to the active unit system — ft² or m²).
- Square footage updates live as rooms are added, deleted, or reshaped (ties
  into C2's live drag updates).
- Bar does not obstruct canvas content or the existing rulers (`RULER_THICKNESS`
  reserved area).
- Values are formatted consistently with `formatLength`/unit system already
  used elsewhere (no ad hoc formatting).

## Group E — Direct manipulation & polish, round 2

Source: root `notes.md`, second hands-on pass through the app (2026-07-11), after
A-D above landed (marquee select, wall/vertex drag, wall labels, and the status
bar are all present in the working tree as of this pass). Grounded against the
current `app/src` implementation.

### E1. Wall hit-test threshold ignores rendered wall thickness
**Priority: P1**

`SelectTool.ts:15-16` defines a flat `WALL_HIT_THRESHOLD_PX = 8`, used at
`SelectTool.ts:57` (`thresholdWorld = WALL_HIT_THRESHOLD_PX / ppu`) regardless
of how thick the wall is actually drawn (`RoomLayer.tsx:39`,
`strokeWidth={room.wallThickness * pixelsPerUnit}`). When zoomed out, a thick
wall's rendered stroke can be visually wider than the 8px hit corridor, and at
high zoom the same fixed threshold can feel too generous relative to what's
drawn — hence "hit box seems inconsistent."

Acceptance criteria:
- Hit threshold scales with the room's actual wall thickness in world units
  (e.g. `max(WALL_HIT_THRESHOLD_PX, room.wallThickness * ppu / 2) / ppu`), so
  the clickable corridor tracks what's drawn on screen at any zoom.
- Manually verified: clicking directly on a rendered wall line selects it at
  both 20% and 400% zoom.
- Vertex threshold (`VERTEX_HIT_THRESHOLD_PX`) re-checked so corners of very
  thick walls don't become harder to grab than the wall itself.

### E2. Configurable wall thickness, defaulting to US standard
**Priority: P1**

`defaultWallThickness: 6` is hardcoded in `projectStore.ts:23` (inches) and
applied to every new room via `RoomTool.ts:20`, but nothing in the UI lets a
user see or change it — `PropertiesPanel.tsx`'s `RoomProperties` (lines 91-126)
exposes Name/Width/Height only, and there is no project-settings panel
anywhere in `app/src/components`.

Acceptance criteria:
- Default changes to 4.5" for imperial projects (standard 2x4 + drywall
  interior wall) with a documented metric equivalent for `units: 'metric'`
  projects.
- A project settings surface (new panel or modal) exposes
  `defaultWallThickness` as an editable field using A1's `parseLength`.
- `RoomProperties` gains a per-room wall-thickness field so an individual
  room can override the project default; changing the project default does
  not retroactively change existing rooms.
- New rooms drawn after changing the setting pick up the new default.

### E3. Draw an interior (dividing) wall inside a room
**Priority: P2**

Clarified scope: this is about adding a new *internal* wall that subdivides a
room's interior (e.g. splitting a great room into two, or partitioning off a
closet, or a peninsula/pony wall that doesn't reach the far side) — not about
reshaping the outer perimeter (see E3b). `Room` (`types/project.ts:30-39`) is
currently a single closed polygon (`points: Point[]`) with no concept of a
wall that doesn't lie on that boundary.

Decided data model (2026-07-11): interior walls are a standalone entity, not
a room-split. The room stays one polygon with one floor area (no change to
D2's sqft calc); the wall is drawn/hit-tested independently. This was chosen
specifically because partial (non-full-span) walls are in scope for v1 —
splitting the parent `Room` polygon only works for walls that fully close off
a new area, so it can't represent a pony wall or peninsula on its own.

Acceptance criteria:
- New type, e.g. `InteriorWall { id, roomId, a: Point, b: Point, thickness,
  locked, visible }`, added to `types/project.ts` and to `Project` (a new
  `interiorWalls: InteriorWall[]` array, parallel to `rooms`).
- New tool or mode lets the user click a start point and an end point to
  place the wall. Endpoints snap to the room's perimeter or to an existing
  interior wall when the cursor is near one, but are not required to —
  free-floating endpoints inside the room are valid (needed for
  peninsulas/pony walls that don't reach the far side).
- Default thickness matches E2's revised interior default (4.5"), overridable
  per-wall the same way `Room.wallThickness` is.
- The new wall renders with the same thickness/labeling conventions as
  perimeter walls (reuses D1/E4's label rendering).
- The new wall is selectable, draggable (extends C2 to handle
  `InteriorWall` alongside `Room` edges/vertices), and deletable, and
  participates in E1's hit-test sizing.
- An interior wall inherits its parent room's `locked`/`visible` state (no
  separate per-wall layer toggle in v1); it's rejected for placement/editing
  when the parent room is locked, consistent with existing checks in
  `SelectTool.ts`.
- Deleting the parent room deletes its interior walls. Dragging (E5) or
  resizing the parent room translates/scales interior wall endpoints along
  with it, since both live in the same world coordinate space.
- Placement is one undo step.

### E3b. Insert a vertex into the outer room shell
**Priority: P2**

Distinct from E3 above — this is about adding a corner to the room's existing
perimeter (e.g. to notch out an alcove), not adding an interior wall. Depends
on C2 (wall/vertex drag), since the inserted vertex should immediately be
draggable through that same path. No current code adds a vertex to an
existing room — `RoomTool.ts` only builds rooms from scratch, and C2's
vertex/wall drag in `SelectTool.ts` only repositions existing points.

Acceptance criteria:
- With a wall selected (`useUIStore().selectedWall`), an action (e.g.
  double-click on the wall) inserts a new vertex at the clicked point,
  splitting that edge of `Room.points` into two collinear segments.
- The new vertex is draggable via the existing C2 vertex-drag path with no
  additional code.
- Insertion is one undo step (`pushSnapshot` before the mutation).
- Rejected on locked rooms/layers, consistent with existing checks in
  `SelectTool.ts`.

### E4. Wall length labels: larger and offset outside the wall
**Priority: P2**

Depends on D1 (this replaces its label styling, not a new labels feature).
Current labels sit on the wall centerline with only a small fixed pixel
offset (`RoomLayer.tsx:52-64`: fontSize 11, `offsetY={12}`;
`SelectionLayer.tsx:68-81`, the in-progress-drawing equivalent: fontSize 11,
`offsetY={14}`) — the offset doesn't account for wall thickness or zoom, so
labels tend to sit on or near the rendered stroke instead of clearly outside
it.

Acceptance criteria:
- Font size increased (e.g. 14-16px) for legibility at typical zoom.
- Offset is computed perpendicular to the wall, outward from the room
  interior, and scales with `room.wallThickness * pixelsPerUnit` plus a fixed
  margin, rather than a flat `offsetY` constant.
- Fix applies to both `RoomLayer.tsx` (committed rooms) and
  `SelectionLayer.tsx`'s `WallLengthLabel` (in-progress drawing) — these
  currently duplicate the same rendering logic, so consider consolidating
  into one shared component/util while fixing the offset.
- Manually verified at low/medium/high zoom that labels read clearly outside
  the wall and don't overlap the room name label.

### E5. Click-and-drag an entire room
**Priority: P1**

`SelectTool.ts`'s room-body hit test (lines 110-119) only sets selection —
it never starts a drag, and `DragState` (uiStore) only has `'wall' |
'vertex'` kinds, no `'room'` kind to translate every point together.

Acceptance criteria:
- Pointer-down inside a room's fill (below the wall/vertex hit-test
  priority already in place) followed by drag moves every point of the room
  by the same delta, with a live preview via the existing
  `dragState.currentPoints` pattern.
- Pointer-up commits the moved points as one undo step, matching C2's
  wall/vertex drag convention.
- Respects grid snap the same way existing drag/draw operations do; blocked
  for locked rooms/layers.
- If multiple rooms are selected (via C1 marquee), dragging any one of them
  moves all selected rooms together, preserving relative positions.

### E6. Remove the redundant "Furniture" tool/tab
**Priority: P3**

`Toolbar.tsx:8` lists a `furniture` tool button, but `FurnitureTool.ts` is a
complete no-op (all five handlers are empty bodies). The only working way to
place furniture is drag-and-drop from `CatalogPanel.tsx` (sets
`dataTransfer` on drag start) onto the canvas — the toolbar entry duplicates
that without doing anything.

Acceptance criteria:
- `furniture` entry removed from `Toolbar.tsx`'s `TOOLS` list.
- `FurnitureTool.ts` deleted along with its dispatch wiring (wherever
  `activeTool === 'furniture'` is switched on, e.g. in `LayoutCanvas.tsx`).
- Drag-and-drop placement from `CatalogPanel` verified unaffected (existing,
  unrelated functionality).
- Any stale persisted `activeTool: 'furniture'` from an old saved session
  falls back to `'select'` rather than erroring.

## Group F — Deferred from the 2026-07-11 cleanup pass

Source: `/simplify` review of Group E's diff (2026-07-11). These were flagged
but intentionally not fixed in that pass because each needs a real design
decision or touches every tool, not just the reviewed diff.

### F1. Per-room re-render/recompute cost during room drag
**Priority: P3**

`RoomLayer.tsx` subscribes the whole layer to `dragState`
(`const dragState = useUIStore((s) => s.dragState)`), which is a new object
on every `pointermove` during a wall/vertex/room drag. Because the component
maps over all rooms in a single `rooms.filter().map()` body, every room in
the project — not just the one being dragged — recomputes `flatPoints`,
`polygonBoundingBox`, and (when wall labels are on) per-wall
distance/angle/offset trig on every frame of the drag.

Acceptance criteria:
- Only the room(s) actually being dragged re-render/recompute on
  `pointermove`; unrelated rooms do not re-run point/label math during
  someone else's drag.
- One viable approach: split each room into its own child component with a
  per-room `dragState` selector (e.g.
  `(s) => s.dragState?.roomId === room.id ? s.dragState.currentPoints : undefined`)
  so Zustand only re-renders the affected room — but pick whatever approach
  keeps `RoomLayer.tsx` from doing O(rooms) work per drag frame.
- Manually verified: dragging one wall in a project with many rooms doesn't
  visibly regress frame rate, and rooms not involved in the drag don't
  re-render (checked via React DevTools profiler or equivalent).

### F2. Room-drag pointer-move materializes full point arrays every frame
**Priority: P3**

Related to F1. `SelectTool.ts`'s room-drag `onPointerMove` branch
(`nextById[id] = orig.map((p) => ({ x: p.x + dx, y: p.y + dy }))`) rebuilds a
brand-new points array for every selected room on every pointer-move —
O(rooms × points) allocations per frame for a large marquee-selected set.

Acceptance criteria:
- Live room-drag preview no longer allocates a full translated-points array
  per room per frame; e.g. `dragState` stores just `(dx, dy)` during the
  drag and the render path (tied to F1's per-room component) derives
  translated points lazily only for the room(s) currently being drawn.
- Final commit on pointer-up still produces the same translated points as
  today (no behavior change, only fixes the intermediate allocation).

### F3. `ToolHandlers` doesn't carry pointer modifiers or the real pointer-up position
**Priority: P2**

`SelectTool.ts:20-41` tracks `shiftHeld` via its own `window.addEventListener`
at module scope, and separately tracks `lastWorldPt`/`dragAnchorWorld` as
module-level `let`s, because `ToolHandlers.onPointerDown/Move/Up`
(`SelectTool.ts:7-13`) doesn't receive keyboard-modifier state, and
`LayoutCanvas.tsx`'s mouse-up handler calls `onPointerUp({x:0,y:0}, ppu)`
instead of forwarding the real pointer position. This is a workaround layered
on the shared tool-dispatch mechanism rather than a fix to it, and the shadow
state has no reset-on-unmount and isn't visible to other tools that might
need the same info later (e.g. a shift-constrain on a future tool).

Acceptance criteria:
- `ToolHandlers` methods (or a `PointerEvent`-like payload) carry modifier
  flags (at least Shift) so tools don't need their own
  `window.addEventListener`.
- `LayoutCanvas.tsx`'s mouse-up handler passes the real world point (it
  already computes one via its existing `getWorldPoint` helper) into
  `onPointerUp` instead of `{x:0,y:0}`.
- `SelectTool.ts`'s `mode`/`dragAnchorWorld` move into `useUIStore`'s
  existing `dragState`/interaction state instead of living as module-level
  `let`s, so drag state is inspectable from the store like everything else.
- All existing select-tool behaviors (marquee shift-add, wall/vertex/room
  drag, double-click vertex insertion) continue to work unchanged — this is
  a refactor of *how* the state is carried, not a behavior change.

### F4. Shared pointer-to-world conversion special-cases one tool's state
**Priority: P3**

`LayoutCanvas.tsx:101-103` computes `isCalibratingImage` by reaching into
`ImageTool`'s private `drawingState.kind === 'calibration'` value to decide
whether to suppress grid snap for that click. `getWorldPoint` is shared by
every tool, so this hardcodes one tool's internal state machine into
common infrastructure; a future tool that also wants raw (unsnapped)
coordinates would have to grow the same if-chain.

Acceptance criteria:
- Each `ToolHandlers` implementation declares whether it wants snapped or
  raw pointer coordinates (e.g. a `wantsRawPointer(): boolean` method or
  static flag on the tool), and `getWorldPoint` consults the active tool
  generically instead of special-casing `'image'` + `'calibration'`.
- B1's calibration behavior (raw, unsnapped coordinates during calibration)
  is unaffected — this only changes how that requirement is expressed, not
  the behavior.

### F5. `load.ts` settings migration is hand-rolled per field
**Priority: P3**

`io/load.ts` patches missing `ProjectSettings` fields (currently just
`rulerMode`) with ad hoc `if (settings.field === undefined) settings.field =
default` checks on an untyped `Record<string, unknown>`, directly above a
`// TODO: schema validation and migrations` comment that already acknowledges
this is a stopgap. E2 added a second settings field
(`defaultWallThickness`) the same way, so this pattern is starting to repeat.

Acceptance criteria:
- Once a project needs its second or third such default-backfill (this may
  already be true — check current `load.ts`), replace the one-off
  `if (x === undefined)` checks with a small ordered list of migration steps
  (e.g. `migrations: ((settings) => void)[]`) applied on load, so adding a
  new settings field with a default doesn't mean adding another inline
  special case.
- Existing saved projects missing newer settings fields still load with the
  documented defaults (no regression for old `.mover.json` files).

## Group G — Direct manipulation & polish, round 3

Source: root `notes.md`, third hands-on pass through the app (2026-07-11), after
Group E landed. Grounded against the current `app/src` implementation (verified
2026-07-11, working tree ahead of `97bce22`).

### G1. Wall length label color/weight and full clearance outside the wall
**Priority: P2**

Depends on / revisits E4. `WallLengthLabel.tsx` renders at `fontSize={15}`
(already bumped by E4) but the caller supplies the color: `RoomLayer.tsx:69`
hardcodes `fill="#8fa"` (green) and `SelectionLayer.tsx`'s in-progress preview
hardcodes `fill="#4a9eff"` / `"#ffb400"` (blue/amber) — neither is the "large
bold black" the note asks for, and neither sets `fontStyle`. Separately,
`wallLabelOffsetY` (`utils/wallLabelOffset.ts:34`) only offsets by
`wallThickness/2 + LABEL_MARGIN_PX (10)` — enough to clear the rendered stroke,
but it doesn't add anything for the label's *own* rendered height
(`fontSize={15}` ⇒ ~18-20px glyph box), so at typical zoom the text's far edge
can still fall back across the wall centerline even though its anchor point is
technically outside it.

Acceptance criteria:
- Label color changed to a bold, high-contrast neutral (e.g. near-black or the
  theme's text color) and made consistent across `RoomLayer.tsx` and
  `SelectionLayer.tsx`'s `WallLengthLabel` usages, replacing the current
  green/blue hardcodes.
- `fontStyle="bold"` (or equivalent) added to `WallLengthLabel`.
- `wallLabelOffsetY` (or its caller) accounts for the label's own rendered
  height in addition to wall thickness + margin, so the whole glyph box clears
  the wall, not just its anchor point.
- Manually verified at low/medium/high zoom and with thin/thick walls that no
  part of the label overlaps the rendered stroke.

### G2. Toolbar button to toggle snap-to-grid
**Priority: P2**

`Toolbar.tsx` (the tool buttons + zoom row) has no snap control today — the
only toggle is `MenuBar.tsx`'s View ▸ "Snap to Grid" entry
(`MenuBar.tsx:176-183`), which requires opening a dropdown for something used
constantly while drawing.

Acceptance criteria:
- A toggle button added to `Toolbar.tsx`, positioned with the zoom controls
  (top right), bound to `project.settings.snapToGrid` via the existing
  `toggleSnapToGrid()` action — same store field `MenuBar` already reads, so
  both stay in sync automatically.
- Active/pressed visual state matches the existing `styles.active` convention
  used for tool selection.
- Matches `MenuBar`'s current behavior of pushing an undo snapshot on toggle
  (`MenuBar.tsx:180`), so undo/redo history isn't fragmented depending on
  which control was used.

### G3. Modifier key to temporarily invert snap-to-grid
**Priority: P2**

Depends on F3 (tool modifier plumbing). Snap is decided in one place —
`LayoutCanvas.tsx`'s `getWorldPoint` (`LayoutCanvas.tsx:94-108`) — purely from
`settings.snapToGrid`; there's no live modifier check. The only modifier
tracked anywhere is Shift, and it's tracked the F3-flagged way: a
`SelectTool.ts`-local `window.addEventListener('keydown'/'keyup')`
(`SelectTool.ts:24-32`) used only for marquee shift-add, invisible to
`getWorldPoint`.

Acceptance criteria:
- Holding a modifier key inverts the effective snap setting for that pointer
  event (snap on → off, off → on) for both live preview and final placement.
  Recommend Ctrl (not Shift) to avoid overloading the key `SelectTool` already
  uses for marquee shift-add — document whichever is chosen.
- Implemented by tracking the modifier directly in `LayoutCanvas` (the shared
  choke point for the snap decision) rather than adding another tool-local
  `window` listener, per F3's guidance not to repeat that pattern.
- Releasing the key restores normal snap behavior on the very next pointer
  event.
- If Shift is chosen instead of Ctrl: confirm select-tool marquee shift-add
  still behaves correctly when combined with the inverted snap (marquee drags
  aren't snapped today regardless, so no actual behavior conflict expected —
  verify this holds).

### G4. Prompt for image origin during reference image import
**Priority: P2**

`startImageImport` (`ImageTool.ts:12-45`) always places the new image at
`x: 0, y: 0` and immediately enters calibration mode
(`setDrawingState({ kind: 'calibration', ... })`), which only ever sets scale
(`finishCalibration`, `ImageTool.ts:52-85`). Nothing lets the user say where
the image's origin (outer top-left, per the note) should land in world space.

Acceptance criteria:
- After import (before or after calibration — pick one and document it), the
  user is prompted to click a canvas point that becomes the image's outer
  top-left origin; the image's `x`/`y` is set from that click.
- Composes with the existing calibration step: calibration keeps setting
  scale only, this step only sets translation.
- Escape cancels the origin step the same way calibration already cancels
  (`ImageTool.ts:104-106`), leaving the image at the default `0,0`.
- Suggested implementation: a new `drawingState.kind` (e.g. `'imageOrigin'`)
  mirroring the existing `'calibration'` state shape.

### G5. Selection hit-test state desyncs during operations
**Priority: P1**

Note: "selection hitboxes become unsynced during operations and only seem to
be fixed by changing zoom levels." Prime suspect is the exact pattern F3
already flagged as tech debt: `SelectTool.ts` keeps `mode`, `lastWorldPt`,
`dragAnchorWorld`, and `lastClickEdge` as module-level `let`s
(`SelectTool.ts:39-47`) instead of store state, with no reset on unmount and
no guarantee they stay consistent with the component tree across re-renders —
changing zoom forces enough re-renders/remounts to incidentally reset them,
which matches the reported "only fixed by changing zoom" symptom.

Acceptance criteria:
- Root cause confirmed (not just assumed) and fixed — most likely resolved as
  part of F3's refactor moving this state into `uiStore`, but treat this as
  its own bug until verified, since F3 is not yet scheduled/landed.
- Manually verified: perform a wall drag, a vertex drag, and a marquee select
  back-to-back at a single fixed zoom level (no zoom change in between) and
  confirm every hit test stays accurate throughout.
- If F3 lands first, re-verify this doesn't reproduce before closing it as a
  duplicate; if F3 is deferred, this needs its own targeted fix.

### G6. Vertex indicators on rooms
**Priority: P1**

Note: "difficult to click and drag vertices I can't find." Confirmed: once a
room is committed, nothing renders its vertices. `HighlightLayer.tsx` (the
selected-room overlay) draws only a dashed outline
(`HighlightLayer.tsx:30-37`) and the selected-wall highlight
(`HighlightLayer.tsx:38-40`) — no vertex markers. `RoomLayer.tsx` doesn't
render any either. The only vertex `Circle`s anywhere are in
`SelectionLayer.tsx`'s in-progress room-drawing preview
(`SelectionLayer.tsx:205-213`), which only exists before a room is closed.

Acceptance criteria:
- Decide always-visible vs. selected-room-only (the note offers both; pick
  one and document it — selected-only is the smaller change since
  `HighlightLayer` already scopes to `selectedRoom`).
- Small circle marker rendered at each vertex, sized/positioned consistently
  with E1's vertex hit-test threshold so the visible target matches the
  actual grabbable area.
- Rendered using the same `ppu` transform as `RoomLayer`/`HighlightLayer`.
- Uses a fill distinct from the existing selected-wall highlight color
  (`#ff5a36`) so the two affordances don't read as the same thing.
- Locked rooms (not draggable per existing checks) should not show vertex
  markers, or should show them visually distinct as non-interactive — pick
  one and document it.

## Suggested build order

1. **A1** unit parsing (unblocks B1's prompt replacement and D2's sqft display)
2. **A2** ruler simplification (independent, but shares config surface with A1)
3. **B1** calibration snap fix (small, isolated, high annoyance-to-fix ratio)
4. **C1** drag-to-select
5. **C2** wall/vertex dragging
6. **D1** wall length labels (natural follow-on to C2 — same drag interactions)
7. **D2** status bar (pulls together tool state + sqft from C1/C2 work)
8. **E6** remove redundant furniture tool (trivial, unblocks nothing but costs
   nothing)
9. **E1** wall hit-test fix (small, high annoyance-to-fix ratio, same area as C2)
10. **E5** whole-room dragging (natural extension of C2's drag infrastructure)
11. **E2** configurable wall thickness (needs A1 for the parsed input field)
12. **E4** wall label offset/sizing (revisit of D1's styling)
13. **E3b** outer-shell vertex insertion (extends C2's vertex-drag target set)
14. **E3** interior dividing walls (bigger data-model lift; do after E3b/E2/E4
    since it reuses their thickness/label/drag conventions)
15. **G5** hitbox desync bug (P1, high-annoyance correctness bug — investigate
    whether F3 alone fixes it before scheduling F3)
16. **G6** vertex indicators (P1, directly unblocks the "can't find the
    vertex" complaint that C2/E1 dragging depends on being discoverable)
17. **G2** toolbar snap toggle (small, high annoyance-to-fix ratio)
18. **G1** wall label color/weight/offset (revisit of D1/E4 styling, same area)
19. **G3** modifier-key snap override (needs F3's modifier plumbing to avoid
    another one-off `window` listener)
20. **G4** reference-image origin prompt (isolated, touches only `ImageTool.ts`)
