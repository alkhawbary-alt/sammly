'use client';

import { Eye, EyeOff, Folder, Image as ImageIcon, ImagePlus, Lock, Shapes, Square, Type, Unlock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Layer } from '@sammly/template-schema';
import { Badge } from '@/components/ui';
import type { Editor } from './useEditor';

const ICONS = { text: Type, raster: ImageIcon, image: ImageIcon, imageSlot: ImagePlus, shape: Square, svg: Shapes, group: Folder } as const;

export function LayerTree({ ed }: { ed: Editor }) {
  const t = useTranslations('editor');
  const doc = ed.doc!;
  const bound = new Map<string, string[]>();
  for (const f of doc.fields) for (const b of f.bindings) bound.set(b.layerId, [...(bound.get(b.layerId) ?? []), f.key]);

  // Photoshop order: topmost layer first.
  const render = (layers: Layer[], depth: number): React.ReactNode =>
    [...layers].reverse().map((l) => {
      const Icon = ICONS[l.type];
      const fields = bound.get(l.id);
      const unmapped = l.type === 'text' && (!l.style.fontId || !ed.fonts[l.style.fontId]);
      const active = ed.selectedId === l.id;
      return (
        <div key={l.id}>
          <div
            onClick={() => ed.setSelectedId(l.id)}
            className={`group flex cursor-pointer items-center gap-1.5 border-b border-slate-100 py-1.5 pe-2 text-xs ${active ? 'bg-brand-50 text-brand-800' : 'hover:bg-slate-50'}`}
            style={{ paddingInlineStart: 8 + depth * 14 }}
          >
            <Icon className={`size-3.5 shrink-0 ${l.type === 'imageSlot' ? 'text-brand-600' : 'text-slate-400'}`} />
            <span className={`min-w-0 flex-1 truncate ${l.visible ? '' : 'text-slate-400 line-through'}`}>{l.name || l.type}</span>
            {fields && <Badge tone="brand">{fields.join(',')}</Badge>}
            {l.type === 'raster' && !fields && <Badge>{t('badge.raster')}</Badge>}
            {unmapped && <Badge tone="red">{t('badge.font')}</Badge>}
            <button
              type="button"
              className="rounded p-0.5 text-slate-400 opacity-0 hover:text-slate-700 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                ed.updateLayer(l.id, { locked: !l.locked });
              }}
              title={l.locked ? t('unlock') : t('lock')}
            >
              {l.locked ? <Lock className="size-3" /> : <Unlock className="size-3 text-brand-500" />}
            </button>
            <button
              type="button"
              className="rounded p-0.5 text-slate-400 hover:text-slate-700"
              onClick={(e) => {
                e.stopPropagation();
                ed.updateLayer(l.id, { visible: !l.visible });
              }}
              title={t('visibility')}
            >
              {l.visible ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
            </button>
          </div>
          {l.type === 'group' && render(l.children, depth + 1)}
        </div>
      );
    });

  return <div className="text-slate-700">{render(doc.layers, 0)}</div>;
}
