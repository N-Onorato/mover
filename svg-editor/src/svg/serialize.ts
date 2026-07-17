import type { SvgNode } from '../types';
import { buildDomNode } from './dom';

export function serializeSvgNode(root: SvgNode): string {
  const el = buildDomNode(root);
  return new XMLSerializer().serializeToString(el as Element);
}
