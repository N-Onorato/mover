import type { SvgNode } from '../types';
import { buildDomNode } from './dom';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Renders `root` into an off-screen (but attached, since getBBox requires
 * layout) SVG and reads back each element's user-space bounding box. Removed
 * immediately after — callers get a plain id -> Box map. */
export function measureNodeBoxes(root: SvgNode): Map<string, Box> {
  const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  host.style.position = 'absolute';
  host.style.width = '0';
  host.style.height = '0';
  host.style.overflow = 'hidden';
  host.setAttribute('aria-hidden', 'true');
  const contentEl = buildDomNode(root) as SVGGraphicsElement;
  host.appendChild(contentEl);
  document.body.appendChild(host);

  const boxes = new Map<string, Box>();
  const walk = (el: Element) => {
    const id = el.getAttribute('id');
    if (id) {
      const box = readBox(el);
      if (box) boxes.set(id, box);
    }
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(contentEl);

  document.body.removeChild(host);
  return boxes;
}

function readBox(el: Element): Box | undefined {
  if (typeof (el as SVGGraphicsElement).getBBox === 'function') {
    try {
      const bbox = (el as SVGGraphicsElement).getBBox();
      if (bbox.width > 0 || bbox.height > 0) {
        return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
      }
    } catch {
      // Layout engines without SVG rendering support (e.g. jsdom) throw here;
      // fall through to the attribute-based estimate below.
    }
  }
  return readBoxFromAttrs(el);
}

/** getBBox() fallback for basic shapes, used when the host environment
 * doesn't implement SVG layout (jsdom, some headless test runners). */
function readBoxFromAttrs(el: Element): Box | undefined {
  const num = (name: string, fallback = 0) => {
    const v = el.getAttribute(name);
    const n = v === null ? NaN : parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  };
  switch (el.tagName.toLowerCase()) {
    case 'rect':
      return { x: num('x'), y: num('y'), width: num('width'), height: num('height') };
    case 'circle': {
      const r = num('r');
      return { x: num('cx') - r, y: num('cy') - r, width: r * 2, height: r * 2 };
    }
    case 'ellipse': {
      const rx = num('rx');
      const ry = num('ry');
      return { x: num('cx') - rx, y: num('cy') - ry, width: rx * 2, height: ry * 2 };
    }
    case 'line': {
      const x1 = num('x1');
      const y1 = num('y1');
      const x2 = num('x2');
      const y2 = num('y2');
      return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
    }
    case 'image':
    case 'use':
      return { x: num('x'), y: num('y'), width: num('width'), height: num('height') };
    default:
      return undefined;
  }
}
