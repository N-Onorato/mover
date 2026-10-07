# Mover — Code Quality Standards & Module Boundaries

Grounded in a full audit of `app/src` (52 files, ~6,300 lines) done 2026-07-18. Concrete findings are cited by file/line so this doc stays actionable instead of generic. Cross-reference `specs/architecture.md` (intended structure) and `specs/backlog.md` (known usability issues) — this doc covers code-quality/structure, not product behavior.

---

## 1. Current known violations (fix list)

These are real, confirmed issues in the repo today — not hypotheticals. Treat this section as a punch list, not aspirational prose.

> **Status 2026-10-06:** #1-#4, #6, #7, #9 and #10 are resolved. View math (`BASE_PIXELS_PER_UNIT`, `pixelsPerUnitFor`, `screenToWorld`, `clampScale`, zoom anchoring) lives once in `utils/scale.ts`; the unused `ScaleConfig` API was dropped. LayoutCanvas's gesture state lives in `canvas/useMouseGestures.ts` (pan, wheel zoom, O1 release-outside-canvas) and `canvas/useTouchGestures.ts`; pointer projection is plain functions in `canvas/pointerToWorld.ts` reading the live view from `useUIStore.getState()`, so no `useCoordinateTransform` hook was needed. Hooks are `hooks/useSelectedEntity.ts` and `hooks/useSnapshotOnce.ts`. Open: #5 (AnnotationLayer stub); #8 is partly addressed (ImageTool, layouts, library, exportPng now have tests; `uiStore`, `RoomTool`, `InteriorWallTool` still don't).

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 1 | Dead module: world/screen transform math duplicated inline instead of using the dedicated module | `app/src/utils/scale.ts` (unused — zero imports repo-wide); reimplemented ad hoc 3x in `app/src/canvas/LayoutCanvas.tsx` (`screenToWorld` callback ~L116, wheel-zoom ~L376-389, pinch-zoom ~L258-280) | Either delete `scale.ts`, or make `LayoutCanvas.tsx` import and use it once via a `useCoordinateTransform` hook. Do not leave a 4th, unused implementation alongside 3 inline copies of the same math. |
| 2 | Shipped debug logging in the pointer hot path | `app/src/canvas/LayoutCanvas.tsx:250,294` — `console.log('[J1] pointerDown'...)` / `pointerMove` behind a "TEMP DEBUG" comment | Remove. Add a lint rule (see §4) so this doesn't reappear. |
| 3 | Same "find selected entity" filter duplicated 4x inline | `app/src/components/PropertiesPanel.tsx` (~L273-289) — separately `.find()`s across rooms/furniture/referenceImages/annotations by `selectedIds` | Extract a single `useSelectedEntity()` hook (in `hooks/`, see §2) that returns a tagged union of the selected entity + its type. |
| 4 | Custom hook defined inline in a component file instead of `hooks/` | `app/src/components/PropertiesPanel.tsx` `useSnapshotOnFocus()` (~L11-23) | Move to `app/src/hooks/useSnapshotOnFocus.ts`. All custom hooks live in one place — no exceptions, so contributors know where to look. |
| 5 | Stub layer silently renders nothing | `app/src/canvas/layers/AnnotationLayer.tsx` (19 lines, `// TODO: render TextLabel and DimensionLine`) | The `Annotation` type + store CRUD exist end-to-end but never render. Either finish it or remove the dead pathway (tool, store fields, UI) until it's scheduled — don't leave a half-wired feature that silently no-ops. |
| 6 | No schema/version validation on load | `app/src/io/load.ts:40` (`// TODO: schema validation`) despite `specs/data-model.md` describing a versioning/migration scheme | Malformed or future-versioned `.mover.json` files fail silently or crash downstream instead of a clear error. Add a validation pass before accepting a loaded project. |
| 7 | Doc drift: `specs/data-model.md` no longer matches `app/src/types/project.ts` | spec is missing `InteriorWall` and `rulerMode`, both present in code | Specs describing the data model must be updated in the same PR that changes `types/project.ts`, not after. |
| 8 | Zero component-level tests; several logic modules untested | No `*.test.tsx` at all; untested: `uiStore.ts`, `historyStore.ts`, `RoomTool.ts`, `InteriorWallTool.ts`, `ImageTool.ts`, `AnnotationTool.ts`, `utils/geometry.ts`, `utils/snap.ts`, `io/save.ts`, `exportPng.ts`/`exportSvg.ts` | See §5 for priority order. |
| 9 | `LayoutCanvas.tsx` is a 451-line component doing rendering + gesture math + state | Touch/pinch tracking (`touchPoints`, `pinchStart`, `suppressTools`, `touchDispatchedToTool` refs), pan/zoom math, and coordinate transforms all live in the component body | Extract to hooks: `usePanZoom`, `useTouchGestures`, `useCoordinateTransform` (see §2, §7). |
| 10 | Empty, undocumented `svg-editor/` directory at repo root | no README, no files | Delete it, or if it's an intentional placeholder for planned work, add a one-line `README.md` explaining what it's for and why it's empty. Don't leave ambiguous empty directories in a repo — the next person can't tell "abandoned" from "reserved." |

---

## 2. Component & hook standards

- **Hooks live in `src/hooks/`, always.** A hook defined inside a component file (`function useX()` above `function PropertiesPanel()`) is the one recurring violation found in this repo (finding #4 above) — it means the next person has to already know it's there to find it. No exceptions for "it's only used in one place."
- **A component that reads the same derived shape from the store more than once should have a hook, not repeated inline `.find()`/`.filter()` logic.** Rule of thumb: if you write the same store-derivation logic in two components (or twice in one), it's a hook. `useSelectedEntity()` (finding #3) is the concrete first case.
- **Business logic — gesture math, coordinate transforms, drag/pan state tracking — does not belong in a component body.** If a `useCallback`/`useRef` cluster in a component exists to implement an algorithm (not to wire up JSX), it belongs in a hook or a plain utility function it calls. `LayoutCanvas.tsx` is the concrete counter-example to fix (finding #9); don't add the next feature to it the same way — grow the extracted hooks instead of the component.
- **Store access**: components read Zustand via selectors (`useProjectStore(s => s.x)`) — this pattern is correct and consistent today, keep it. Non-React code (tools, canvas event handlers) reads via `useXStore.getState()` imperatively — also correct, keep it. Don't introduce a third access pattern (e.g. Context wrapping the store) without a concrete reason.
- **Tools stay plain TypeScript objects, not React.** The `ToolHandlers` pattern (`onPointerDown/Move/Up`, dispatch table in `canvas/tools/index.ts`) is deliberate so tool logic is testable without rendering — `SelectTool.test.ts` (423 lines) is proof this works. Don't reach for a hook or component when adding a new tool; implement `ToolHandlers` and register it in the dispatch table.

## 3. Type & utility duplication

- **One canonical type per concept, in `types/project.ts` (domain types) or colocated with the module that owns it (e.g. `ViewState` in `store/uiStore.ts`).** The repo is currently clean here — `Point` has exactly one definition and is imported everywhere. Keep it that way: before adding a new `{x, y}`-shaped or `{width, height}`-shaped interface, grep for an existing one first.
- **Inline shape literals should become named types once reused twice.** `utils/geometry.ts` returns an inline `{x, y, width, height}` rather than a named `Rect` — fine as a single occurrence, but if a third place needs the same shape, name it.
- **Before writing a new coordinate-transform, hit-test, or drag-math function, check `utils/geometry.ts` and the tool that already implements the closest analog first.** Corner/rotation math for furniture and images is centralized in `SelectTool.ts` (`furnitureCenter`, `furnitureCorners`, `imageCorners`, `furnitureRotateHandle`) and exported for reuse by layers — this is the right pattern (geometry math lives with the tool/domain that owns the shape, gets exported, gets reused) — follow it for new entity types instead of recomputing corner math per-layer.
- **Dead code gets deleted, not left "in case it's needed."** `utils/scale.ts`'s old `ScaleConfig` API was the concrete example (finding #1, now removed). A module with zero importers is a liability: it silently drifts out of sync with the logic that actually runs.

## 4. Lint / CI gates worth adding

The repo has `oxlint` configured (`app/.oxlintrc.json`) and a `lint` script, but `.github/workflows/deploy.yml` only builds and deploys — it does not appear to run `npm test` or `npm run lint` as a gate. Recommended:

- Add a `no-console` rule (or restrict to `console.warn`/`error`) to catch the class of issue in finding #2 before merge.
- Run `npm run lint` and `npm test` in CI on every PR, not just on deploy to `main`.
- Consider `oxlint`'s `no-unused-vars`/dead-export detection (or a `ts-prune`-style check) to catch zero-importer modules going forward.

## 5. Test coverage priorities

Given zero component tests exist and the store/tool logic is the highest-risk surface (it's the actual state machine driving the canvas), prioritize in this order:

1. `uiStore.ts` — the drag/drawing discriminated-union state machine itself is untested; only its consumers (`SelectTool.test.ts`) are. A bug here silently corrupts interaction state.
2. `RoomTool.ts`, `InteriorWallTool.ts`, `ImageTool.ts` — same class of tool as `SelectTool`, which is well-tested; these have zero coverage despite equivalent complexity.
3. `utils/geometry.ts` — pure functions, cheap to test, underpin all hit-testing.
4. `io/save.ts` / round-trip with `io/load.ts` (already partially tested) to lock in the file format.
5. Component tests are lower priority given the canvas-heavy, store-driven architecture (most logic is already outside components by design) — but `PropertiesPanel.tsx`'s derivation logic (finding #3) becomes trivially testable once extracted into `useSelectedEntity()`, which is a good first component-adjacent test target.

---

## 6. Proposed 4-part module split

This is a single Vite app, not a monorepo, and at ~6,300 lines a workspace/package split would add tooling overhead (build config, cross-package versioning) out of proportion to the codebase size. The recommended split is **four logical modules with an enforced import direction**, not four npm packages — revisit packages only if the app grows enough to need independent deployment or reuse outside this repo.

```
┌─────────────────────────────────────────────┐
│ 4. App Shell                                 │
│    App.tsx, main.tsx, hooks/, furniture/     │
└───────────────┬───────────────────────────────┘
                │ depends on
        ┌───────┴────────┐
        ▼                ▼
┌───────────────┐  ┌──────────────────┐
│ 3. UI Panels   │  │ 2. Canvas Engine │
│  components/   │  │  canvas/         │
└───────┬────────┘  └────────┬──────────┘
        │                    │
        └─────────┬──────────┘
                   ▼ depends on
        ┌───────────────────────┐
        │ 1. Domain / Data Core │
        │  types/, store/, io/, │
        │  utils/, furniture/   │
        │    catalog.ts         │
        └───────────────────────┘
```

### 1. Domain / Data Core (`types/`, `store/`, `io/`, `utils/`, `furniture/catalog.ts`)
The document model, its persistence, and pure math. No React, no Konva. This is already the cleanest-separated part of the codebase — `types/project.ts` is the single source of truth, `store/*` holds all mutable state, `io/*` handles serialization, `utils/*` is pure functions. **Rule going forward: nothing in this layer imports from `canvas/` or `components/`.** This is enforceable today (oxlint import-restriction rule or a simple CI grep) with zero refactor, since it's already true in practice.

### 2. Canvas Engine (`canvas/`, including `layers/` and `tools/`)
Everything Konva-facing: the `Stage`, the fixed z-ordered layers, and the tool state machines. Depends on the Domain Core (reads/writes stores, uses geometry utils) but never on `components/`. This is where finding #9's extraction work (`useMouseGestures`, `useTouchGestures`, `pointerToWorld`) lives — as hooks colocated with this module, not in the shared `hooks/` folder, since they're canvas-specific, not general-purpose. (General-purpose hooks like `useMediaQuery` stay in the top-level `hooks/`.)

### 3. UI Panels (`components/`)
Toolbar, CatalogPanel, LayerPanel, PropertiesPanel, MenuBar, SettingsPanel, MobileDrawer. Depends on Domain Core (store selectors) directly; does not depend on Canvas Engine internals — panels should only ever talk to the canvas through the store (e.g., set the active tool, set selection), never import a tool class or layer component. This boundary is *not* fully clean today (verify no panel reaches into `canvas/tools/*` directly) but is close, and is worth stating explicitly now before it grows.

### 4. App Shell (`App.tsx`, `main.tsx`, general-purpose `hooks/`)
Composition root: lays out the panels and canvas together, owns app-wide concerns that don't belong to a single module (media-query-driven responsive layout via `useMediaQuery`). This is the only layer allowed to import from both UI Panels and Canvas Engine.

### Enforcing the boundary
Since this stays one package, the boundary is a convention unless enforced. Two low-cost options, either is sufficient at this size:
- An `oxlint`/ESLint `no-restricted-imports` rule per directory (e.g. `store/**` and `utils/**` may not import `canvas/**` or `components/**`).
- A CI script (`grep -rl "from '.*canvas" app/src/store app/src/utils app/src/types` should return nothing) — cheaper to write, easier to bypass; use only if tooling setup is a blocker.

If the app later grows enough to warrant real packages (e.g. reusing the Canvas Engine in another host app, or a second frontend consuming the Domain Core), this split maps directly onto `packages/domain`, `packages/canvas`, `packages/ui`, `packages/app` in an npm/pnpm workspace with minimal rework, because the dependency direction is already correct.
