'use client';

import { Eye, Layers2, Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { buildRenderHtml } from '@sammly/renderer-html';
import type { Layer } from '@sammly/template-schema';
import type { Editor } from './useEditor';

type Box = { x: number; y: number; width: number; height: number; rotation: number };

/** Point-in-rotated-rectangle test in canvas coordinates. */
function hit(l: Box, px: number, py: number): boolean {
  const cx = l.x + l.width / 2, cy = l.y + l.height / 2;
  const a = (-l.rotation * Math.PI) / 180;
  const dx = px - cx, dy = py - cy;
  const rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(rx) <= l.width / 2 && Math.abs(ry) <= l.height / 2;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function Canvas({ ed }: { ed: Editor }) {
  const t = useTranslations('editor');
  const doc = ed.doc!;
  const { width: W, height: H } = doc.canvas;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 800, h: 600 });
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [compare, setCompare] = useState<'off' | 'original' | 'overlay'>('off');
  const [drag, setDrag] = useState<{ id: string; mode: 'move' | 'resize'; sx: number; sy: number; start: Box; cur: Box } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e!.contentRect.width, h: e!.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = Math.max(0.05, Math.min((box.w - 48) / W, (box.h - 48) / H));
  const scale = zoom === 'fit' ? fit : zoom;

  // Rebuild the preview page shortly after edits settle (srcdoc reloads the frame).
  const debouncedDoc = useDebounced(doc, 150);
  const debouncedValues = useDebounced(ed.values, 250);
  const html = useMemo(
    () =>
      buildRenderHtml(debouncedDoc, debouncedValues, {
        mode: 'preview',
        resolveAsset: (id) => ed.assets[id] ?? '',
        resolveFont: (id) => ed.fonts[id],
      }).html,
    [debouncedDoc, debouncedValues, ed.assets, ed.fonts],
  );

  const toCanvas = (e: { clientX: number; clientY: number }, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    const p = toCanvas(e, e.currentTarget);
    const handle = (e.target as HTMLElement).dataset.handle;
    const sel = ed.selected;
    if (sel && !sel.locked && (handle === 'resize' || (sel.type !== 'group' && hit(sel, p.x, p.y)))) {
      e.currentTarget.setPointerCapture(e.pointerId);
      const start = { x: sel.x, y: sel.y, width: sel.width, height: sel.height, rotation: sel.rotation };
      setDrag({ id: sel.id, mode: handle === 'resize' ? 'resize' : 'move', sx: p.x, sy: p.y, start, cur: start });
      return;
    }
    // Topmost visible, non-group layer under the pointer.
    const candidates = ed.layers.filter((l) => l.type !== 'group' && l.visible && hit(l, p.x, p.y));
    ed.setSelectedId(candidates.length ? candidates[candidates.length - 1]!.id : null);
  };

  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const p = toCanvas(e, e.currentTarget);
    const dx = Math.round(p.x - drag.sx), dy = Math.round(p.y - drag.sy);
    const s = drag.start;
    const cur = drag.mode === 'move' ? { ...s, x: s.x + dx, y: s.y + dy } : { ...s, width: Math.max(10, s.width + dx), height: Math.max(10, s.height + dy) };
    setDrag({ ...drag, cur });
  };

  const onPointerUp = () => {
    if (!drag) return;
    const { x, y, width, height } = drag.cur;
    ed.updateLayer(drag.id, { x, y, width, height } as Partial<Layer>);
    setDrag(null);
  };

  const sel = ed.selected;
  const selBox: Box | null = drag ? drag.cur : sel && sel.type !== 'group' ? sel : null;
  const compositeUrl = doc.meta.compositeAssetId ? ed.assets[doc.meta.compositeAssetId] : undefined;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-1.5 text-xs">
        <div className="flex items-center gap-1">
          <button type="button" className="rounded p-1.5 hover:bg-slate-100" onClick={() => setZoom(Math.max(0.1, scale / 1.25))} title={t('zoomOut')}>
            <ZoomOut className="size-4" />
          </button>
          <span className="w-12 text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <button type="button" className="rounded p-1.5 hover:bg-slate-100" onClick={() => setZoom(Math.min(4, scale * 1.25))} title={t('zoomIn')}>
            <ZoomIn className="size-4" />
          </button>
          <button type="button" className="rounded p-1.5 hover:bg-slate-100" onClick={() => setZoom('fit')} title={t('fit')}>
            <Maximize className="size-4" />
          </button>
          <span className="ms-2 text-slate-400" dir="ltr">
            {W}×{H}
          </span>
        </div>
        {compositeUrl && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setCompare(compare === 'original' ? 'off' : 'original')} className={`flex items-center gap-1 rounded px-2 py-1 ${compare === 'original' ? 'bg-brand-600 text-white' : 'hover:bg-slate-100'}`}>
              <Eye className="size-3.5" /> {t('original')}
            </button>
            <button type="button" onClick={() => setCompare(compare === 'overlay' ? 'off' : 'overlay')} className={`flex items-center gap-1 rounded px-2 py-1 ${compare === 'overlay' ? 'bg-brand-600 text-white' : 'hover:bg-slate-100'}`}>
              <Layers2 className="size-3.5" /> {t('overlay')}
            </button>
          </div>
        )}
      </div>
      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-auto bg-slate-200/70 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:16px_16px]">
        <div className="flex min-h-full min-w-full items-center justify-center p-6" dir="ltr">
          <div className="relative shrink-0 shadow-lg ring-1 ring-black/5" style={{ width: W * scale, height: H * scale }}>
            {/* Rulers: tick every 100px of canvas space */}
            <div className="pointer-events-none absolute -top-4 left-0 h-3 w-full" style={{ backgroundImage: `repeating-linear-gradient(to right, #94a3b8 0 1px, transparent 1px ${100 * scale}px)` }} />
            <div className="pointer-events-none absolute -left-4 top-0 h-full w-3" style={{ backgroundImage: `repeating-linear-gradient(to bottom, #94a3b8 0 1px, transparent 1px ${100 * scale}px)` }} />
            <iframe
              title="preview"
              // allow-same-origin: an opaque-origin frame can't load localhost assets in dev (Chrome local-network
              // rules). Scripts stay locked down by the page's own CSP (only the nonce'd auto-fit script runs).
              sandbox="allow-scripts allow-same-origin"
              srcDoc={html}
              className="pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-white"
              style={{ width: W, height: H, transform: `scale(${scale})`, visibility: compare === 'original' ? 'hidden' : 'visible' }}
            />
            {compositeUrl && compare !== 'off' && (
              <img src={compositeUrl} alt="" className="pointer-events-none absolute inset-0 size-full" style={{ opacity: compare === 'overlay' ? 0.5 : 1 }} />
            )}
            <div className="absolute inset-0 cursor-crosshair" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
              {selBox && (
                <div
                  className={`absolute border-2 ${sel?.locked ? 'border-sky-500' : 'cursor-move border-brand-500'}`}
                  style={{ left: selBox.x * scale, top: selBox.y * scale, width: selBox.width * scale, height: selBox.height * scale, transform: `rotate(${selBox.rotation}deg)` }}
                >
                  <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-white">
                    {sel?.name} · {Math.round(selBox.width)}×{Math.round(selBox.height)}
                  </span>
                  {!sel?.locked && <span data-handle="resize" className="absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-sm border-2 border-brand-500 bg-white" />}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
