import { useEffect, useRef, useState } from 'react';
import type { SvgNode } from '../types';
import { buildDomNode } from '../svg/dom';

interface Props {
  root: SvgNode;
  viewBox: [number, number, number, number];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

interface HighlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function CanvasView({ root, viewBox, selectedId, onSelect }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const svgHostRef = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState<HighlightRect | null>(null);

  useEffect(() => {
    const host = svgHostRef.current;
    if (!host) return;
    host.innerHTML = '';
    const el = buildDomNode(root) as SVGElement;
    el.setAttribute('width', '100%');
    el.setAttribute('height', '100%');
    if (!el.getAttribute('viewBox')) {
      el.setAttribute('viewBox', viewBox.join(' '));
    }
    host.appendChild(el);
  }, [root, viewBox]);

  useEffect(() => {
    const host = svgHostRef.current;
    if (!host) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target === host || target.tagName.toLowerCase() === 'svg') {
        onSelect(null);
        return;
      }
      const id = target.id;
      onSelect(id || null);
    };
    host.addEventListener('click', handleClick);
    return () => host.removeEventListener('click', handleClick);
  }, [onSelect]);

  useEffect(() => {
    const host = svgHostRef.current;
    const wrapper = wrapperRef.current;
    if (!host || !wrapper || !selectedId) {
      setHighlight(null);
      return;
    }
    const target = host.querySelector(`#${CSS.escape(selectedId)}`);
    if (!target) {
      setHighlight(null);
      return;
    }
    const targetRect = target.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    setHighlight({
      left: targetRect.left - wrapperRect.left,
      top: targetRect.top - wrapperRect.top,
      width: targetRect.width,
      height: targetRect.height,
    });
  }, [selectedId, root]);

  return (
    <div className="canvas-wrapper" ref={wrapperRef}>
      <div className="svg-host" ref={svgHostRef} />
      {highlight && (
        <div
          className="selection-highlight"
          style={{
            left: highlight.left,
            top: highlight.top,
            width: highlight.width,
            height: highlight.height,
          }}
        />
      )}
    </div>
  );
}
