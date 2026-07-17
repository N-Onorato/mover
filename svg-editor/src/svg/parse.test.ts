import { describe, expect, it } from 'vitest';
import { parseSvgString } from './parse';
import { serializeSvgNode } from './serialize';
import { buildMvsvgDocument, parseMvsvgDocument } from './mvsvgFormat';

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40" viewBox="0 0 100 40">
  <rect id="cap-left" x="0" y="0" width="10" height="40" fill="#333"/>
  <rect id="body" x="10" y="0" width="80" height="40" fill="#666"/>
  <rect id="cap-right" x="90" y="0" width="10" height="40" fill="#333"/>
</svg>`;

describe('parseSvgString', () => {
  it('reads width/height/viewBox and preserves existing ids', () => {
    const parsed = parseSvgString(SAMPLE_SVG);
    expect(parsed.width).toBe(100);
    expect(parsed.height).toBe(40);
    expect(parsed.viewBox).toEqual([0, 0, 100, 40]);
    const ids = parsed.root.children.map((c) => c.id);
    expect(ids).toEqual(['cap-left', 'body', 'cap-right']);
  });

  it('assigns stable ids to elements missing one', () => {
    const parsed = parseSvgString('<svg width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>');
    expect(parsed.root.children[0].id).toMatch(/^mv-gen-/);
  });
});

describe('serializeSvgNode', () => {
  it('round-trips element structure', () => {
    const parsed = parseSvgString(SAMPLE_SVG);
    const out = serializeSvgNode(parsed.root);
    const reparsed = parseSvgString(out);
    expect(reparsed.root.children.map((c) => c.attrs.id)).toEqual(['cap-left', 'body', 'cap-right']);
  });
});

describe('mvsvg document format', () => {
  it('round-trips rules and meta through export/import', () => {
    const parsed = parseSvgString(SAMPLE_SVG);
    const doc = {
      meta: { name: 'nine-slice-button', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      parsed,
      rules: {
        'cap-left': { role: 'fixed' as const },
        body: { role: 'stretch-x' as const, colorRole: 'primary' as const },
        'cap-right': { role: 'fixed' as const },
      },
    };
    const xml = buildMvsvgDocument(doc);
    const reimported = parseMvsvgDocument(xml);
    expect(reimported.meta.name).toBe('nine-slice-button');
    expect(reimported.rules.body).toEqual({ role: 'stretch-x', colorRole: 'primary' });
    expect(reimported.parsed.width).toBe(100);
    expect(reimported.parsed.root.children).toHaveLength(3);
  });
});
