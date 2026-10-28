'use client';

import { ImagePlus, Layers, Plus, Type, Wallpaper } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import type { LayerInput } from '@sammly/template-schema';
import { api, uploadFile } from '@/lib/api';
import { Button, Spinner } from '@/components/ui';
import type { Editor } from './useEditor';

const newId = () => Math.random().toString(36).slice(2, 12);

export interface IngestedImage {
  id: string;
  url: string;
  width: number;
  height: number;
}

export async function uploadImageAsset(file: File, kind: 'LAYER' | 'UPLOAD' = 'LAYER'): Promise<IngestedImage> {
  const sourceKey = await uploadFile('image', file);
  return api<IngestedImage>('/assets', { method: 'POST', body: { sourceKey, kind } });
}

/** Manual composition: background / foreground images, image slot, text box. Added layers are unlocked (draggable). */
export function AddLayerMenu({ ed }: { ed: Editor }) {
  const t = useTranslations('editor');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<'background' | 'foreground'>('background');
  const { width: W, height: H } = ed.doc!.canvas;

  const add = (layer: LayerInput, position: 'bottom' | 'top') => {
    ed.updateDoc((doc) => {
      if (position === 'bottom') doc.layers.unshift(layer as never);
      else doc.layers.push(layer as never);
    });
    ed.setSelectedId(layer.id);
    setOpen(false);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const img = await uploadImageAsset(file);
      ed.addAssetUrls({ [img.id]: img.url });
      const isBg = pending.current === 'background';
      add({ id: newId(), name: isBg ? t('add.background') : t('add.foreground'), type: 'raster', assetId: img.id, x: 0, y: 0, width: W, height: H, locked: false }, isBg ? 'bottom' : 'top');
    } finally {
      setBusy(false);
    }
  };

  const items = [
    { key: 'background', icon: Wallpaper, run: () => ((pending.current = 'background'), fileRef.current?.click()) },
    { key: 'foreground', icon: Layers, run: () => ((pending.current = 'foreground'), fileRef.current?.click()) },
    {
      key: 'slot',
      icon: ImagePlus,
      run: () => add({ id: newId(), name: '@photo', type: 'imageSlot', x: Math.round(W * 0.25), y: Math.round(H * 0.2), width: Math.round(W * 0.5), height: Math.round(W * 0.5), emptyColor: '#e2e8f0', locked: false }, 'top'),
    },
    {
      key: 'text',
      icon: Type,
      run: () =>
        add(
          {
            id: newId(),
            name: t('add.textName'),
            type: 'text',
            text: 'نص جديد',
            x: Math.round(W * 0.1),
            y: Math.round(H * 0.75),
            width: Math.round(W * 0.8),
            height: Math.round(H * 0.1),
            direction: 'rtl',
            textBox: 'box',
            verticalAlign: 'middle',
            style: { fontSize: Math.round(H / 18), color: '#111111', align: 'center', fontFamily: 'sans-serif', fontWeight: 700 },
            fit: { mode: 'wrap-shrink', minFontSize: Math.round(H / 36) },
            locked: false,
          },
          'top',
        ),
    },
  ] as const;

  return (
    <div className="relative">
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
      <Button variant="secondary" size="sm" className="w-full" onClick={() => setOpen(!open)}>
        {busy ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />} {t('add.title')}
      </Button>
      {open && (
        <div className="absolute inset-x-0 top-9 z-20 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {items.map(({ key, icon: Icon, run }) => (
            <button key={key} type="button" onClick={run} className="flex w-full items-center gap-2 px-3 py-2 text-start text-xs hover:bg-slate-50">
              <Icon className="size-3.5 text-slate-500" /> {t(`add.${key}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
