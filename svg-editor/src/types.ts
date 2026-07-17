export type Role =
  | 'fixed'
  | 'stretch-x'
  | 'stretch-y'
  | 'stretch-both'
  | 'repeat-x'
  | 'repeat-y';

export const ROLES: Role[] = [
  'fixed',
  'stretch-x',
  'stretch-y',
  'stretch-both',
  'repeat-x',
  'repeat-y',
];

export const ROLE_LABELS: Record<Role, string> = {
  fixed: 'Fixed (never resizes)',
  'stretch-x': 'Stretch horizontally',
  'stretch-y': 'Stretch vertically',
  'stretch-both': 'Stretch both axes',
  'repeat-x': 'Repeat horizontally to fill',
  'repeat-y': 'Repeat vertically to fill',
};

/** A color slot an element can be tagged with, so recoloring an asset means
 * setting one value instead of hunting for every matching fill/stroke. */
export type ColorRole = 'primary' | 'secondary' | 'accent' | 'outline';

export const COLOR_ROLES: ColorRole[] = ['primary', 'secondary', 'accent', 'outline'];

export interface ElementRule {
  role: Role;
  colorRole?: ColorRole;
}

export type RuleMap = Record<string, ElementRule>;

/** Node in the parsed SVG element tree. Every element gets a stable `id`
 * (existing id attribute if present, otherwise a generated one) so rules and
 * selection can reference it independent of the DOM. */
export interface SvgNode {
  id: string;
  tag: string;
  attrs: Record<string, string>;
  children: SvgNode[];
  /** Only set for text-content nodes (tag === '#text'). */
  text?: string;
}

export interface ParsedSvg {
  root: SvgNode;
  width: number;
  height: number;
  viewBox: [number, number, number, number];
}

export interface AssetMeta {
  name: string;
  sourceFilename?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssetDocument {
  meta: AssetMeta;
  parsed: ParsedSvg;
  rules: RuleMap;
}
