import { useEffect, useMemo, useRef } from 'react';
import type { AssetDocument } from '../types';
import { collectUnits } from '../svg/units';
import { measureNodeBoxes } from '../svg/measure';
import { computePreviewPlan, axisIsResizable } from '../layoutEngine';
import { buildPreviewDom } from '../svg/previewDom';

interface Props {
  doc: AssetDocument;
  targetWidth: number;
  targetHeight: number;
  onTargetWidthChange: (w: number) => void;
  onTargetHeightChange: (h: number) => void;
}

export function PreviewPanel({ doc, targetWidth, targetHeight, onTargetWidthChange, onTargetHeightChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const { parsed, rules } = doc;
  const originalSize = { width: parsed.width, height: parsed.height };

  const units = useMemo(() => collectUnits(parsed.root, rules), [parsed.root, rules]);
  const canResizeX = useMemo(() => axisIsResizable(units, rules, 'x'), [units, rules]);
  const canResizeY = useMemo(() => axisIsResizable(units, rules, 'y'), [units, rules]);

  const effectiveWidth = canResizeX ? targetWidth : originalSize.width;
  const effectiveHeight = canResizeY ? targetHeight : originalSize.height;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const boxes = measureNodeBoxes(parsed.root);
    const plan = computePreviewPlan(units, boxes, rules, originalSize, {
      width: effectiveWidth,
      height: effectiveHeight,
    });
    const el = buildPreviewDom(parsed.root, plan, effectiveWidth, effectiveHeight);
    el.setAttribute('width', '100%');
    el.setAttribute('height', '100%');
    host.innerHTML = '';
    host.appendChild(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed.root, rules, units, effectiveWidth, effectiveHeight]);

  return (
    <div className="preview-panel">
      <div className="preview-controls">
        <label>
          Width: {Math.round(effectiveWidth)}
          <input
            type="range"
            min={Math.max(4, originalSize.width * 0.25)}
            max={originalSize.width * 3}
            value={effectiveWidth}
            disabled={!canResizeX}
            onChange={(e) => onTargetWidthChange(Number(e.target.value))}
          />
        </label>
        <label>
          Height: {Math.round(effectiveHeight)}
          <input
            type="range"
            min={Math.max(4, originalSize.height * 0.25)}
            max={originalSize.height * 3}
            value={effectiveHeight}
            disabled={!canResizeY}
            onChange={(e) => onTargetHeightChange(Number(e.target.value))}
          />
        </label>
        {(!canResizeX || !canResizeY) && (
          <p className="hint">
            Tag at least one element as stretch/repeat on an axis to preview resizing it.
          </p>
        )}
      </div>
      <div className="preview-host" ref={hostRef} />
    </div>
  );
}
