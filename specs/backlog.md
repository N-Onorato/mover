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

## Suggested build order

1. **A1** unit parsing (unblocks B1's prompt replacement and D2's sqft display)
2. **A2** ruler simplification (independent, but shares config surface with A1)
3. **B1** calibration snap fix (small, isolated, high annoyance-to-fix ratio)
4. **C1** drag-to-select
5. **C2** wall/vertex dragging
6. **D1** wall length labels (natural follow-on to C2 — same drag interactions)
7. **D2** status bar (pulls together tool state + sqft from C1/C2 work)
