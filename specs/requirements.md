# Mover — Requirements

## Functional Requirements

### Canvas & Viewport

- [ ] Infinite pan via middle-mouse drag or space+drag
- [ ] Zoom in/out via scroll wheel, with zoom-to-cursor behavior
- [ ] Configurable grid (show/hide, snap-to-grid toggle) with adaptive resolution: grid subdivisions change with zoom level (e.g. 1 inch at high zoom, 6 inches at normal, 1 foot zoomed out); the coarsest displayed level is the configured `gridSize`
- [ ] Ruler guides along canvas edges showing real-world units at the current grid resolution
- [ ] Units: feet/inches and metric (cm/m), switchable per project
- [ ] Selection box (drag to multi-select)

### Room Drawing

- [ ] Draw rectangular rooms by clicking two corners
- [ ] Draw polygonal rooms by clicking vertices, close with click-on-start or double-click
- [ ] Walls have configurable thickness (default 6 inches / 15 cm)
- [ ] Rooms can be labeled (name displayed in center)
- [ ] Rooms can be filled with a color or left transparent
- [ ] Walls snap to grid and to other walls
- [ ] Edit room by dragging vertices (reshapes polygon) or dragging a wall segment (slides the edge parallel, preserving adjacent wall angles)

### Furniture

- [ ] Built-in catalog of common furniture (see catalog spec)
- [ ] Place furniture by dragging from catalog panel to canvas
- [ ] Move furniture by dragging
- [ ] Rotate furniture in 90-degree increments via keyboard (R key) or freely via handle
- [ ] Resize furniture by dragging corner handles (maintains aspect ratio by default, free with Shift held)
- [ ] Furniture displays real-world dimensions as a label when selected
- [ ] Furniture snaps to grid and optionally to walls
- [ ] Copy/paste furniture (Ctrl+C / Ctrl+V)
- [ ] Furniture can be locked to prevent accidental movement

### Furniture Definitions

- [ ] Each furniture piece has: name, category, width, depth (real-world), shape (SVG path or rectangle)
- [ ] Users can create custom furniture definitions via a form (name, dimensions, simple shape)
- [ ] Import a furniture definition from a JSON file
- [ ] Export a custom definition to JSON for sharing
- [ ] Custom furniture persists in the project file

### Reference Images

- [ ] Import a reference image (JPG, PNG, SVG) via file picker or drag-and-drop onto canvas
- [ ] Reference image renders below all other layers (non-interactive by default)
- [ ] Scale calibration: user clicks two points on the image and enters the real-world distance between them — the image scales accordingly
- [ ] Adjust image opacity (slider, 0–100%)
- [ ] Move/resize/rotate the reference image in a dedicated "image edit" mode
- [ ] Multiple reference images supported per project
- [ ] Reference images are embedded in the save file (base64)

### Layers

- [ ] Layer panel: reference images, rooms, furniture, annotations (fixed layer order)
- [ ] Individual layers can be toggled visible/hidden
- [ ] Layers can be locked (items on a locked layer are not selectable)

### Annotations

- [ ] Place text labels anywhere on the canvas
- [ ] Draw a dimension line: click two points, shows real-world measurement
- [ ] Simple arrows/pointers

### Save / Load / Export

- [ ] Save project as `.mover.json` file (browser download)
- [ ] Load project by opening a `.mover.json` file via file picker
- [ ] Auto-save to browser localStorage (on by default, opt-out in settings; a visible "Unsaved changes" badge shows when the in-memory state differs from the last file save)
- [ ] Export canvas as PNG (current viewport or full layout bounding box)
- [ ] Export canvas as SVG
- [ ] Undo/redo (Ctrl+Z / Ctrl+Shift+Z), minimum 50 steps; one undo step = one committed action (mouseup after drag, room closed, furniture placed) — mid-drag positions are not recorded

### Settings

- [ ] Units preference (imperial / metric)
- [ ] Grid size (in real-world units)
- [ ] Default wall thickness
- [ ] Canvas background color
- [ ] Snap sensitivity

---

## Non-Functional Requirements

- Runs in the browser with no server (fully static, can be served from GitHub Pages or a local file)
- Works offline after initial load (PWA optional but desirable)
- Handles a layout with 200+ furniture items without noticeable lag (< 16ms frame time)
- Project files remain human-readable JSON
- No telemetry, tracking, or network requests after page load
- Accessible: keyboard-navigable primary actions, sufficient color contrast in UI chrome

---

## Out of Scope (v1)

- Symbols library beyond furniture (electrical, plumbing)
- 3D elevation views
- PDF import
- Collaborative editing
- Printing directly (use PNG/SVG export + print)
