import type { SvgNode } from '../types';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface DomBuildOptions {
  /** Extra attributes to overlay per node id, e.g. a transform computed by
   * the preview layout engine. Applied after the node's own attrs. */
  attrOverrides?: Record<string, Record<string, string>>;
}

export function buildDomNode(node: SvgNode, options: DomBuildOptions = {}): Node {
  if (node.tag === '#text') {
    return document.createTextNode(node.text ?? '');
  }
  const el = document.createElementNS(SVG_NS, node.tag);
  for (const [name, value] of Object.entries(node.attrs)) {
    // createElementNS already puts every element in the SVG namespace, so
    // re-declaring a plain `xmlns` attribute here would serialize twice.
    if (name === 'xmlns') continue;
    el.setAttribute(name, value);
  }
  const overrides = options.attrOverrides?.[node.id];
  if (overrides) {
    for (const [name, value] of Object.entries(overrides)) {
      el.setAttribute(name, value);
    }
  }
  for (const child of node.children) {
    el.appendChild(buildDomNode(child, options));
  }
  return el;
}

/** Depth-first walk, parent before children. */
export function walkNodes(node: SvgNode, visit: (n: SvgNode) => void): void {
  visit(node);
  for (const child of node.children) walkNodes(child, visit);
}

export function findNode(node: SvgNode, id: string): SvgNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}
