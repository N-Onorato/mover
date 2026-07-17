# SVG Enricher

A standalone editor for preparing SVG assets (fixtures, furniture icons, etc.)
so they scale correctly instead of just stretching uniformly. It's a sibling
project to `../app`, not yet wired into it — the plan is to fold its output
format into `/app`'s furniture catalog once the editor and format have
proven themselves.

## What it does

1. Open an SVG.
2. Click individual elements on the canvas and tag each one with a resize
   role:
   - **fixed** (default for untagged elements) — never changes size or grows;
     shifts position only to stay adjacent to whatever's stretching next to it.
   - **stretch-x / stretch-y / stretch-both** — grows to absorb extra space
     when the asset is resized on that axis.
   - **repeat-x / repeat-y** — instead of stretching, tiles copies of the
     element along that axis to fill the extra space (e.g. slats, studs,
     a repeating trim pattern).
   - Optionally tag an element with a **color role**
     (primary/secondary/accent/outline) so a future consumer can recolor the
     asset by setting one value instead of hunting through fills/strokes.
3. Drag the width/height sliders in the preview panel to see the asset
   resize live using those rules.
4. Export as `.mvsvg` — a single XML document that wraps the original,
   untouched SVG plus the tag metadata. Re-opening a `.mvsvg` file loads it
   back into the editor for further tagging.

## How resizing is computed

Every element is either explicitly tagged or, if left untagged, treated as
an implicitly "fixed" leaf. Elements are laid out along each axis
independently: elements are sorted by their original position, extra space is
distributed proportionally across the stretch/repeat elements (weighted by
their own original size), and every fixed element downstream of a
stretch/repeat element shifts by however much space that element absorbed.
See `src/layoutEngine.ts`.

## The `.mvsvg` format

```xml
<mover:asset xmlns:mover="https://mover.app/ns/enriched-svg" version="1">
  <mover:meta name="..." sourceFilename="..." createdAt="..." updatedAt="..."/>
  <mover:rules>
    <mover:rule id="cap-left" role="fixed"/>
    <mover:rule id="body" role="stretch-x" colorRole="primary"/>
  </mover:rules>
  <mover:content>
    <svg>...original SVG, untouched, with generated ids for previously
    id-less elements...</svg>
  </mover:content>
</mover:asset>
```

Stripping the `mover:*` wrapper leaves a normal, renderable SVG.

## Development

```
npm install
npm run dev     # dev server
npm run test    # vitest
npm run build   # typecheck + production build
npm run lint    # oxlint
```
