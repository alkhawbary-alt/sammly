'use client';

import { FileImage, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { STANDARD_SIZES, type TemplateDraft } from '@sammly/template-schema';
import { api } from '@/lib/api';
import { runPsdImport } from '@/components/templates/NewTemplateModal';
import { Button, ErrorNote, Spinner } from '@/components/ui';
import type { Editor, FontInfo } from './useEditor';

interface VariantResponse {
  revision: number;
  variantId: string;
  draft: TemplateDraft;
  assets: Record<string, string>;
  fonts: Record<string, FontInfo>;
}

export function VariantTabs({ ed }: { ed: Editor }) {
  const t = useTranslations('editor.variants');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const variants = ed.draft!.variants;
  const missing = STANDARD_SIZES.filter((s) => !variants.some((v) => v.width === s.width && v.height === s.height));

  const apply = (r: VariantResponse) => {
    ed.setDraft(r.draft);
    ed.setRevision(r.revision);
    ed.setAssets(r.assets);
    ed.addFonts(r.fonts);
    ed.setVariantId(r.variantId);
    ed.setSelectedId(null);
    ed.setSaveState('saved');
    setOpen(false);
  };

  const ready = async () => {
    // Variant creation is server-side: make sure pending edits are saved first.
    for (let i = 0; i < 40 && (ed.saveStateRef.current === 'dirty' || ed.saveStateRef.current === 'saving'); i++) await new Promise((r) => setTimeout(r, 250));
  };

  const duplicateAs = async (s: (typeof STANDARD_SIZES)[number]) => {
    setBusy(s.id);
    setError(null);
    try {
      await ready();
      apply(await api<VariantResponse>(`/templates/${ed.id}/variants`, { method: 'POST', body: { revision: ed.revisionRef.current, duplicateOf: ed.variantId, width: s.width, height: s.height } }));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const importPsd = async (file: File | undefined) => {
    if (!file) return;
    setBusy('psd');
    setError(null);
    try {
      const imp = await runPsdImport(file, () => {});
      await ready();
      apply(await api<VariantResponse>(`/templates/${ed.id}/variants`, { method: 'POST', body: { revision: ed.revisionRef.current, fromImportId: imp.id } }));
      await ed.query.refetch();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative flex items-center gap-1 border-b border-slate-200 bg-white px-3 py-1.5">
      {variants.map((v, i) => (
        <button
          key={v.id}
          type="button"
          onClick={() => {
            ed.setVariantId(v.id);
            ed.setSelectedId(null);
          }}
          className={`rounded-md px-2.5 py-1 text-xs ${v.id === ed.variantId ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          {v.name} <span className="opacity-60">{v.width}×{v.height}</span>
          {i === 0 && <span className="ms-1 opacity-60">★</span>}
        </button>
      ))}
      <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} busy={!!busy}>
        <Plus className="size-3.5" /> {t('add')}
      </Button>
      <input ref={fileRef} type="file" accept=".psd" className="hidden" onChange={(e) => importPsd(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
      {open && (
        <div className="absolute start-3 top-10 z-30 w-72 space-y-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          <div className="px-1 text-[11px] font-semibold text-slate-400">{t('duplicateAs')}</div>
          {missing.map((s) => (
            <button key={s.id} type="button" onClick={() => duplicateAs(s)} className="flex w-full items-center justify-between rounded px-2 py-1.5 text-start text-xs hover:bg-slate-50">
              <span>{s.name}</span>
              <span className="text-slate-400">
                {busy === s.id ? <Spinner className="size-3" /> : `${s.width}×${s.height}`}
              </span>
            </button>
          ))}
          <p className="px-1 text-[11px] text-slate-400">{t('duplicateHelp')}</p>
          <div className="border-t border-slate-100 pt-1">
            <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-xs hover:bg-slate-50">
              {busy === 'psd' ? <Spinner className="size-3.5" /> : <FileImage className="size-3.5" />} {t('fromPsd')}
            </button>
          </div>
          <ErrorNote error={error} />
        </div>
      )}
    </div>
  );
}
