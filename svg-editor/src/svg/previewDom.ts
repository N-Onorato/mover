import type { SvgNode } from '../types';
import type { PreviewPlan, UnitPlan } from '../layoutEngine';
import { buildDomNode } from './dom';

const SVG_NS = 'http://www.w3.org/2000/svg';

function anchoredTransform(plan: UnitPlan): string {
  const { box, shiftX, shiftY, scaleX, scaleY } = plan;
  const cx = box.x + shiftX;
  const cy = box.y + shiftY;
  return `translate(${cx} ${cy}) scale(${scaleX} ${scaleY}) translate(${-box.x} ${-box.y})`;
}

function buildUnitWrapper(node: SvgNode, plan: UnitPlan): Element {
  const wrapper = document.createElementNS(SVG_NS, 'g');
  wrapper.setAttribute('data-mv-unit', node.id);

  if (plan.tileCountX > 1 || plan.tileCountY > 1) {
    const outer = document.createElementNS(SVG_NS, 'g');
    outer.setAttribute('transform', `translate(${plan.shiftX} ${plan.shiftY})`);
    const stepX = plan.tileCountX > 1 ? plan.box.width : 0;
    const stepY = plan.tileCountY > 1 ? plan.box.height : 0;
    const count = Math.max(plan.tileCountX, plan.tileCountY);
    for (let i = 0; i < count; i += 1) {
      const tile = document.createElementNS(SVG_NS, 'g');
      tile.setAttribute('transform', `translate(${i * stepX} ${i * stepY})`);
      tile.appendChild(buildDomNode(node));
      outer.appendChild(tile);
    }
    wrapper.appendChild(outer);
  } else {
    wrapper.setAttribute('transform', anchoredTransform(plan));
    wrapper.appendChild(buildDomNode(node));
  }
  return wrapper;
}

function buildContainer(node: SvgNode, plan: PreviewPlan): Node {
  if (node.tag === '#text') {
    return document.createTextNode(node.text ?? '');
  }
  const unitPlan = plan.get(node.id);
  if (unitPlan) {
    return buildUnitWrapper(node, unitPlan);
  }
  const el = document.createElementNS(SVG_NS, node.tag);
  for (const [name, value] of Object.entries(node.attrs)) {
    el.setAttribute(name, value);
  }
  for (const child of node.children) {
    el.appendChild(buildContainer(child, plan));
  }
  return el;
}

/** Rebuilds the tree for the resize preview: pass-through containers render
 * normally, but any node that is a "unit" in the plan (tagged element, or an
 * implicitly-fixed leaf) is replaced with its transformed/tiled wrapper. */
export function buildPreviewDom(
  root: SvgNode,
  plan: PreviewPlan,
  targetWidth: number,
  targetHeight: number,
): Element {
  const el = buildContainer(root, plan) as Element;
  el.setAttribute('width', String(targetWidth));
  el.setAttribute('height', String(targetHeight));
  el.setAttribute('viewBox', `0 0 ${targetWidth} ${targetHeight}`);
  return el;
}
