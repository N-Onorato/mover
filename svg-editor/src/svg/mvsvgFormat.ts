import type { AssetDocument, AssetMeta, ElementRule, ParsedSvg, Role, RuleMap } from '../types';
import { ROLES } from '../types';
import { parseSvgString } from './parse';
import { serializeSvgNode } from './serialize';

/** Mover's "enriched SVG" format: a single XML document that wraps the
 * original SVG verbatim (inside mover:content) alongside metadata that
 * describes how each tagged element should behave when the asset is
 * resized. Keeping the source SVG untouched means the file stays a normal
 * SVG once mover:meta/mover:rules are stripped. */
export const MVSVG_NAMESPACE = 'https://mover.app/ns/enriched-svg';
export const MVSVG_VERSION = '1';

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildMvsvgDocument(doc: AssetDocument): string {
  const { meta, parsed, rules } = doc;
  const ruleEntries = Object.entries(rules);

  const ruleLines = ruleEntries
    .map(([id, rule]) => {
      const colorAttr = rule.colorRole ? ` colorRole="${escapeAttr(rule.colorRole)}"` : '';
      return `    <mover:rule id="${escapeAttr(id)}" role="${escapeAttr(rule.role)}"${colorAttr}/>`;
    })
    .join('\n');

  const svgMarkup = serializeSvgNode(parsed.root);

  return `<?xml version="1.0" encoding="UTF-8"?>
<mover:asset xmlns:mover="${MVSVG_NAMESPACE}" version="${MVSVG_VERSION}">
  <mover:meta name="${escapeAttr(meta.name)}" sourceFilename="${escapeAttr(meta.sourceFilename ?? '')}" createdAt="${escapeAttr(meta.createdAt)}" updatedAt="${escapeAttr(meta.updatedAt)}"/>
  <mover:rules>
${ruleLines}
  </mover:rules>
  <mover:content>
${svgMarkup}
  </mover:content>
</mover:asset>
`;
}

export function parseMvsvgDocument(xmlText: string): AssetDocument {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Could not parse .mvsvg file: ' + parserError.textContent);
  }

  const assetEl = doc.documentElement;
  if (assetEl.localName !== 'asset' || assetEl.namespaceURI !== MVSVG_NAMESPACE) {
    throw new Error('Not a mover enriched-SVG document (missing mover:asset root)');
  }

  const metaEl = assetEl.getElementsByTagNameNS(MVSVG_NAMESPACE, 'meta')[0];
  const meta: AssetMeta = {
    name: metaEl?.getAttribute('name') ?? 'Untitled asset',
    sourceFilename: metaEl?.getAttribute('sourceFilename') || undefined,
    createdAt: metaEl?.getAttribute('createdAt') ?? new Date().toISOString(),
    updatedAt: metaEl?.getAttribute('updatedAt') ?? new Date().toISOString(),
  };

  const rules: RuleMap = {};
  const ruleEls = Array.from(assetEl.getElementsByTagNameNS(MVSVG_NAMESPACE, 'rule'));
  for (const ruleEl of ruleEls) {
    const id = ruleEl.getAttribute('id');
    const role = ruleEl.getAttribute('role') as Role | null;
    if (!id || !role || !ROLES.includes(role)) continue;
    const colorRole = ruleEl.getAttribute('colorRole');
    const rule: ElementRule = { role };
    if (colorRole) rule.colorRole = colorRole as ElementRule['colorRole'];
    rules[id] = rule;
  }

  const contentEl = assetEl.getElementsByTagNameNS(MVSVG_NAMESPACE, 'content')[0];
  const svgEl = contentEl ? Array.from(contentEl.children).find((c) => c.localName === 'svg') : undefined;
  if (!svgEl) {
    throw new Error('mover:content is missing an embedded <svg> element');
  }
  const parsed: ParsedSvg = parseSvgString(new XMLSerializer().serializeToString(svgEl));

  return { meta, parsed, rules };
}
