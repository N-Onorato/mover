import type { RuleMap, SvgNode } from '../types';

const NON_GEOMETRY_TAGS = new Set(['defs', 'style', 'title', 'desc', 'metadata', 'symbol', '#text']);

export interface Unit {
  node: SvgNode;
}

/** A "unit" is the largest subtree that moves/scales as one piece: either an
 * explicitly-tagged element (the whole subtree, however deep, is one rigid
 * or stretchy block), or — for anything left untagged — each individual leaf
 * geometry element, treated as implicitly "fixed". Container elements
 * (untagged <g>/<svg>) are transparent and just recursed through. */
export function collectUnits(root: SvgNode, rules: RuleMap): Unit[] {
  const units: Unit[] = [];

  const visitChildren = (node: SvgNode) => {
    for (const child of node.children) visit(child);
  };

  const visit = (node: SvgNode) => {
    if (node.tag === '#text') return;
    if (rules[node.id]) {
      units.push({ node });
      return;
    }
    if (node.children.length === 0) {
      if (!NON_GEOMETRY_TAGS.has(node.tag)) {
        units.push({ node });
      }
      return;
    }
    visitChildren(node);
  };

  visitChildren(root);
  return units;
}
