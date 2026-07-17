import { describe, expect, it } from 'vitest';
import { parseSvgString } from './svg/parse';
import { collectUnits } from './svg/units';
import { measureNodeBoxes } from './svg/measure';
import { axisIsResizable, computePreviewPlan } from './layoutEngine';
import type { RuleMap } from './types';

const NINE_SLICE_BUTTON = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40" viewBox="0 0 100 40">
  <rect id="cap-left" x="0" y="0" width="10" height="40"/>
  <rect id="body" x="10" y="0" width="80" height="40"/>
  <rect id="cap-right" x="90" y="0" width="10" height="40"/>
</svg>`;

function rules(): RuleMap {
  return {
    'cap-left': { role: 'fixed' },
    body: { role: 'stretch-x' },
    'cap-right': { role: 'fixed' },
  };
}

describe('layout engine', () => {
  it('reports an axis as resizable only when a stretch/repeat unit is tagged on it', () => {
    const parsed = parseSvgString(NINE_SLICE_BUTTON);
    const units = collectUnits(parsed.root, rules());
    expect(axisIsResizable(units, rules(), 'x')).toBe(true);
    expect(axisIsResizable(units, rules(), 'y')).toBe(false);
  });

  it('grows the stretch-x unit and shifts the trailing fixed cap by the same amount', () => {
    const parsed = parseSvgString(NINE_SLICE_BUTTON);
    const units = collectUnits(parsed.root, rules());
    const boxes = measureNodeBoxes(parsed.root);
    const plan = computePreviewPlan(units, boxes, rules(), { width: 100, height: 40 }, { width: 140, height: 40 });

    const left = plan.get('cap-left')!;
    const body = plan.get('body')!;
    const right = plan.get('cap-right')!;

    expect(left.shiftX).toBe(0);
    expect(left.scaleX).toBe(1);

    expect(body.shiftX).toBe(0);
    expect(body.scaleX).toBeCloseTo(1.5, 5); // 80 -> 120, delta 40 all absorbed by the only stretch unit

    expect(right.shiftX).toBeCloseTo(40, 5);
    expect(right.scaleX).toBe(1);
  });
});
