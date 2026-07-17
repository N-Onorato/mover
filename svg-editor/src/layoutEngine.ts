import type { Box } from './svg/measure';
import type { Unit } from './svg/units';
import type { Role, RuleMap } from './types';

export interface UnitPlan {
  /** Amount every point in this unit's original bbox is shifted, before scaling. */
  shiftX: number;
  shiftY: number;
  scaleX: number;
  scaleY: number;
  /** >1 for repeat-x/repeat-y units: render this many copies tiled along the axis. */
  tileCountX: number;
  tileCountY: number;
  box: Box;
}

export type PreviewPlan = Map<string, UnitPlan>;

interface AxisResult {
  shift: number;
  scale: number;
  tileCount: number;
}

/** Lays units out left-to-right (or top-to-bottom): units before the
 * stretch/repeat band don't move, units after it shift by the total extra
 * space the band absorbed, and stretch/repeat units grow (or tile) in place,
 * distributing the size delta proportionally by their own original extent. */
function computeAxisPlan(
  units: Array<{ id: string; box: Box; role: Role }>,
  axis: 'x' | 'y',
  delta: number,
): Map<string, AxisResult> {
  const posKey = axis === 'x' ? 'x' : 'y';
  const sizeKey = axis === 'x' ? 'width' : 'height';
  const stretchRole: Role = axis === 'x' ? 'stretch-x' : 'stretch-y';
  const repeatRole: Role = axis === 'x' ? 'repeat-x' : 'repeat-y';

  const isFlexible = (role: Role) => role === stretchRole || role === 'stretch-both' || role === repeatRole;

  const totalFlexSize = units
    .filter((u) => isFlexible(u.role))
    .reduce((sum, u) => sum + u.box[sizeKey], 0);

  const sorted = [...units].sort((a, b) => a.box[posKey] - b.box[posKey]);

  const result = new Map<string, AxisResult>();
  let runningExtra = 0;
  for (const u of sorted) {
    const flexible = isFlexible(u.role) && totalFlexSize > 0;
    const shift = runningExtra;
    if (flexible) {
      const share = u.box[sizeKey] / totalFlexSize;
      const extra = share * delta;
      if (u.role === repeatRole) {
        const naturalSize = u.box[sizeKey] || 1;
        const tileCount = Math.max(1, Math.round((naturalSize + extra) / naturalSize));
        const actualExtra = (tileCount - 1) * naturalSize;
        runningExtra += actualExtra;
        result.set(u.id, { shift, scale: 1, tileCount });
      } else {
        const scale = u.box[sizeKey] > 0 ? (u.box[sizeKey] + extra) / u.box[sizeKey] : 1;
        runningExtra += extra;
        result.set(u.id, { shift, scale, tileCount: 1 });
      }
    } else {
      result.set(u.id, { shift, scale: 1, tileCount: 1 });
    }
  }
  return result;
}

export function computePreviewPlan(
  units: Unit[],
  boxes: Map<string, Box>,
  rules: RuleMap,
  originalSize: { width: number; height: number },
  targetSize: { width: number; height: number },
): PreviewPlan {
  const entries = units
    .map((u) => ({ id: u.node.id, box: boxes.get(u.node.id), role: rules[u.node.id]?.role ?? ('fixed' as Role) }))
    .filter((e): e is { id: string; box: Box; role: Role } => !!e.box);

  const deltaX = targetSize.width - originalSize.width;
  const deltaY = targetSize.height - originalSize.height;
  const xPlan = computeAxisPlan(entries, 'x', deltaX);
  const yPlan = computeAxisPlan(entries, 'y', deltaY);

  const plan: PreviewPlan = new Map();
  for (const e of entries) {
    const x = xPlan.get(e.id)!;
    const y = yPlan.get(e.id)!;
    plan.set(e.id, {
      shiftX: x.shift,
      shiftY: y.shift,
      scaleX: x.scale,
      scaleY: y.scale,
      tileCountX: x.tileCount,
      tileCountY: y.tileCount,
      box: e.box,
    });
  }
  return plan;
}

/** Whether at least one tagged unit can absorb extra space on the given axis
 * — if not, the preview should clamp that axis to the original size instead
 * of silently ignoring the drag. */
export function axisIsResizable(units: Unit[], rules: RuleMap, axis: 'x' | 'y'): boolean {
  const stretchRole: Role = axis === 'x' ? 'stretch-x' : 'stretch-y';
  const repeatRole: Role = axis === 'x' ? 'repeat-x' : 'repeat-y';
  return units.some((u) => {
    const role = rules[u.node.id]?.role;
    return role === stretchRole || role === 'stretch-both' || role === repeatRole;
  });
}
