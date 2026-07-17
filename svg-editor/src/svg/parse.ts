import type { ParsedSvg, SvgNode } from '../types';

const SVG_NS = 'http://www.w3.org/2000/svg';

let counter = 0;
function nextId(): string {
  counter += 1;
  return `mv-gen-${counter}`;
}

function elementToNode(el: Element): SvgNode {
  const attrs: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    attrs[attr.name] = attr.value;
  }
  const id = attrs.id && attrs.id.trim().length > 0 ? attrs.id : nextId();
  attrs.id = id;

  const children: SvgNode[] = [];
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      children.push(elementToNode(child as Element));
    } else if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? '';
      if (text.trim().length > 0) {
        children.push({ id: nextId(), tag: '#text', attrs: {}, children: [], text });
      }
    }
  }

  return { id, tag: el.tagName.toLowerCase(), attrs, children };
}

function parseViewBox(value: string | undefined, width: number, height: number): [number, number, number, number] {
  if (value) {
    const parts = value.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      return [parts[0], parts[1], parts[2], parts[3]];
    }
  }
  return [0, 0, width, height];
}

function parseLengthAttr(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

export function parseSvgString(svgText: string): ParsedSvg {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Could not parse SVG: ' + parserError.textContent);
  }
  const svgEl = doc.documentElement;
  if (svgEl.namespaceURI !== SVG_NS && svgEl.tagName.toLowerCase() !== 'svg') {
    throw new Error('Root element is not <svg>');
  }

  const viewBoxAttr = svgEl.getAttribute('viewBox') ?? undefined;
  const widthAttr = parseLengthAttr(svgEl.getAttribute('width') ?? undefined, 0);
  const heightAttr = parseLengthAttr(svgEl.getAttribute('height') ?? undefined, 0);
  const viewBox = parseViewBox(viewBoxAttr, widthAttr || 100, heightAttr || 100);
  const width = widthAttr || viewBox[2];
  const height = heightAttr || viewBox[3];

  const root = elementToNode(svgEl);
  return { root, width, height, viewBox };
}

/** Every generated document gets its own id counter so re-parsing the same
 * file twice in one session doesn't collide with ids from the first pass. */
export function resetIdCounter(): void {
  counter = 0;
}
