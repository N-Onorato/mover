# Mover — Canvas Library Evaluation

Evaluated June 2026. Download and bundle data pulled live from npm registry and Bundlephobia.

## Quick Reference

| | Konva.js 10 | Fabric.js 7 | Pixi.js v8 | Paper.js | SVG.js | Two.js |
|---|---|---|---|---|---|---|
| **Latest version** | 10.3.0 | 7.4.0 | 8.19.0 | 0.12.18 | 3.2.5 | 0.8.23 |
| **Last release** | Apr 2026 | May 2026 | Jun 2026 | Jul 2024 | Sep 2024 | Jan 2026 |
| **Weekly npm downloads** | ~2,030,000 | ~819,000 | ~801,000 | ~323,000 | ~765,000 | ~10,000 |
| **Min+gzip** | 54 KB | 92 KB | 251 KB* | 84 KB | 25 KB | 49 KB |
| **Renderer** | Canvas 2D | Canvas 2D | WebGL/WebGPU | Canvas 2D | SVG DOM | SVG/Canvas/WebGL |
| **Built-in drag/move** | Yes | Yes | Manual | Manual | Manual | Manual |
| **Built-in resize+rotate handles** | Yes (Transformer) | Yes (Controls) | No | No | No | No |
| **Multi-select + group transform** | Yes | Yes (ActiveSelection) | No | No | No | No |
| **Named layers with lock/visibility** | Yes | No (z-order only) | No | Yes | No | No |
| **React: first-party bindings** | Yes (react-konva) | No | Yes (@pixi/react) | No | No | No |
| **TypeScript** | First-party | First-party | First-party | DefinitelyTyped | First-party | DefinitelyTyped |
| **Actively maintained** | Yes | Yes | Yes | Slow | Yes | Slow |

*Pixi.js is tree-shakeable; real import weight in a focused app will be less.

---

## Konva.js 10.3.0 + react-konva

**Renderer:** Canvas 2D with a hidden hit-graph canvas per layer.

Konva maintains two canvases per layer: a visible scene canvas and a hidden hit canvas that paints each shape in a unique color. Pointer events are resolved by pixel lookup on the hit canvas rather than bounding-box math, so hit detection is both precise and fast regardless of overlap or rotation.

**Why it wins for a floor plan editor:**

- `Konva.Transformer` is a built-in first-class citizen. Pass one or many nodes and you get corner/edge resize anchors plus a rotation handle. Multi-select resize, aspect-ratio lock, min/max dimension constraints, and `transform`/`transformend` events all work out of the box. Nothing else in this list comes close.
- Each `Konva.Layer` gets its own `<canvas>` element, so reference images, rooms, furniture, and the selection UI each update independently. This maps directly to the layer architecture in `architecture.md`.
- `react-konva` (official, maintained by the same author) provides a fully declarative JSX API: `<Stage>`, `<Layer>`, `<Group>`, `<Rect>`, `<Path>`, `<Image>`, `<Transformer>`. State flows through React; Konva handles rendering.
- 54 KB gzip — lightest Canvas 2D option.
- Highest adoption by a wide margin (~2M weekly downloads vs ~800K for the next two).

**Caveats:**
- Canvas 2D font rendering differs subtly from browser CSS text — acceptable for dimension labels, worth knowing.
- HiDPI requires manually passing `window.devicePixelRatio` to the Stage.
- Transformer multi-select resize with mixed aspect ratios needs configuration to feel right.

---

## Fabric.js 7.4.0

**Renderer:** Canvas 2D.

Note: the user initially referenced v6, but Fabric is currently at v7. The only breaking change from v6 is that `originX`/`originY` now default to `'center'` instead of `'left'/'top'`.

**Strengths:**
- Richest built-in object model: `IText` (inline editable text), `Textbox`, `Polygon`, `Polyline`, full `Control` class for custom handles. If floor plan labels needed to be editable by clicking directly on the canvas, Fabric has an advantage.
- Best SVG document ingestion (`loadSVGFromString`/`loadSVGFromURL` parses full SVG files into Fabric objects). Useful if furniture shapes are authored as SVG files.
- `ActiveSelection` gives multi-select transform that behaves like a document editor.
- First-party TypeScript.

**Gaps for this use case:**
- No native named-layer system. Z-order is managed with `bringToFront`/`sendToBack`. Simulating four named layers (reference images, rooms, furniture, annotations) requires either multiple overlaid `<canvas>` elements or manual z-order bookkeeping — more app code than Konva's built-in `Layer`.
- No first-party React package. The best third-party option is `fabricjs-react` (last published December 2024). In practice, most Fabric+React apps use a `useRef`/`useEffect` integration pattern manually — workable but more boilerplate than `react-konva`.
- 92 KB gzip — notably heavier than Konva.

**Verdict:** Strong alternative if SVG document import or in-canvas text editing becomes a priority. The layer-system gap is the main reason it ranks below Konva for this specific app.

---

## Pixi.js v8.19.0 + @pixi/react 8

**Renderer:** WebGL (primary), WebGPU (v8 addition), Canvas 2D (fallback).

Pixi is a game engine. Its rendering pipeline, object lifecycle, and event system are optimized for high-frame-rate games with thousands of GPU-composited sprites — not document editors with selection boxes and resize handles.

**The blocking gap:** There are no built-in transform handles. No selection UI. No resize or rotation handles. Building an interactive floor plan editor on raw Pixi.js means implementing from scratch what Konva's `Transformer` provides out of the box: pointer event listeners, hit testing, handle graphics rendered as separate display objects, resize/rotate math. Community plugins exist (`pixi-transformer`) but are not official and not as complete.

**Other considerations:**
- `@pixi/react` v8 requires React 19.
- 251 KB gzip even before tree-shaking; after tree-shaking, still the heaviest option.
- WebGL context loss (low-VRAM devices, many open tabs) needs explicit handling.
- 100–300 furniture objects is well within Canvas 2D performance range — GPU compositing is unnecessary at this scale.

**Verdict:** Not recommended. The game-engine orientation and missing editor primitives mean weeks of custom scaffolding. File away as an upgrade path if the layout ever needs 1,000+ objects or GPU-accelerated filters.

---

## Paper.js 0.12.18

**Renderer:** Canvas 2D.

Paper.js is a vector scripting library descended from Scriptographer (an Illustrator plugin). Its strength is programmatic path geometry: boolean operations, path simplification, segment/curve manipulation, tangent/normal queries.

**The problems:**
- Development has stalled. 0.12.18 was released July 2024 with no release since. The 0.x version signals the API is not considered stable.
- No built-in interactive handles. A GitHub issue from years ago requesting basic drag handles remains unresolved.
- React bindings (`@psychobolt/react-paperjs`) have not been updated in years and are effectively abandoned.
- TypeScript via DefinitelyTyped — incomplete, missing overloads.
- Hit detection uses geometric computation (`project.hitTest`) rather than a pixel-lookup hit canvas, so it is slower than Konva for complex overlapping shapes.

Paper.js would only be worth considering if the app needed complex vector boolean operations (union/difference/intersection of room polygons, for example). Even then, the stalled maintenance and dead React bindings make it a long-term risk.

**Verdict:** Do not use.

---

## SVG.js 3.2.5 / Raw inline SVG in React

**Renderer:** SVG DOM (browser native).

SVG.js is a wrapper around the browser's native SVG DOM API. In a React project, using SVG.js alongside React causes conflicts: React's reconciler will overwrite SVG.js DOM mutations on re-render. The correct approach in a React app is **plain inline SVG in JSX** — no SVG.js, just `<svg>`, `<rect>`, `<path>` as React elements with standard event handlers.

**Genuine advantages of SVG:**
- SVG path rendering fidelity is perfect — the browser's native SVG engine handles anti-aliasing, sub-pixel rendering, and CSS styling. No triangulation artifacts (unlike Pixi.js).
- Accessibility: SVG elements are in the DOM and can have ARIA attributes.
- Zero additional bundle weight if using plain JSX SVG.
- Hit detection is automatic via DOM events — SVG elements receive pointer events on their geometric area natively.

**Performance:** At 100–300 objects, modern browsers handle interactive SVG without perceptible lag when one object moves at a time (typical for a floor plan tool). Pan/zoom that transforms all objects simultaneously is measurably worse than Canvas 2D.

**The gap:** No built-in selection or transform handles. All editor interaction must be built as application code. This is a significant investment for a feature we need on day one.

**Verdict:** Viable only if the team wants zero canvas dependency and is prepared to build the interaction layer from scratch. Not recommended when Konva provides equivalent results with built-in handles.

---

## Two.js 0.8.23

Eliminated. ~10,000 weekly downloads vs ~800K–2M for the other options. No built-in interactivity, no official React bindings, no first-party TypeScript. No competitive advantage for any dimension relevant to this project.

---

## Decision

**Konva.js + react-konva remains the correct choice.**

The deciding factors are:

1. `Konva.Transformer` delivers working drag/resize/rotate/multi-select on day one. Every alternative requires building this from scratch.
2. Konva's `Layer`-per-canvas architecture maps exactly to the four-layer model in `architecture.md` (reference images, rooms, furniture, annotations) with independent redraw per layer.
3. `react-konva` provides a first-party declarative API with React 19 support.
4. Smallest gzip of the Canvas 2D options (54 KB) and highest adoption (~2M downloads/week).
5. Actively released as recently as April 2026.

Fabric.js is the strongest alternative. If future requirements demand in-canvas text editing or rich SVG document import (e.g., importing a furniture silhouette as an SVG file), Fabric would be worth re-evaluating. The architecture is similar enough that a migration would not require redesigning the data model.
