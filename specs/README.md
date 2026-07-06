# Mover — Specs

Design and requirements documentation for the Mover 2D home layout planner.

## Documents

| File | What it covers |
|------|----------------|
| [overview.md](overview.md) | Project goals, non-goals, target users, success criteria |
| [requirements.md](requirements.md) | Functional and non-functional requirements, feature checklist |
| [architecture.md](architecture.md) | Tech stack, source layout, rendering model, coordinate system, file format |
| [data-model.md](data-model.md) | TypeScript types for all persisted data: project, rooms, furniture, images, annotations |
| [library-evaluation.md](library-evaluation.md) | Comparison of Konva.js, Fabric.js, Pixi.js, Paper.js, SVG.js, Two.js — with decision rationale |

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Polygon room editing UX | **Both** — vertex drag reshapes, wall-segment drag slides the whole edge parallel. Distinct interactions, both needed. |
| 2 | Furniture SVG paths | **Hand-authored SVG paths** for all ~25 v1 catalog pieces. Full silhouette fidelity, clean geometry, authored once in Inkscape or by hand. |
| 3 | localStorage auto-save | **Opt-out** (on by default). Protects against accidental tab close. A visible "Unsaved changes" indicator keeps file state transparent. |
| 4 | Undo granularity | **Commit-only** — one undo step per committed action (mouseup after drag, room closed, furniture placed). Mid-drag positions are not recorded. |
| 5 | Grid snap resolution | **Adaptive multi-level** — subdivisions change with zoom level (e.g. 1 in at high zoom, 6 in at normal, 1 ft at low). Standard CAD behavior. |
