'use client';

import { ImagePlus, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import type { Field, FieldValue, FieldValues, ImageValue } from '@sammly/template-schema';
import { Input, Select, Spinner, Textarea } from './ui';

const label = (l: { ar: string; en?: string }, locale: string) => (locale === 'en' && l.en ? l.en : l.ar);

export interface FieldFormProps {
  fields: Field[];
  values: FieldValues;
  onChange: (key: string, value: FieldValue | undefined) => void;
  /** Upload an image and return its asset id + preview URL. */
  uploadImage: (file: File) => Promise<{ id: string; url: string }>;
  imageUrl: (assetId: string) => string | undefined;
  errors?: Record<string, string>;
  /** Extra controls rendered under a field (e.g. the AI rewrite button). */
  extra?: (field: Field) => ReactNode;
}

/**
 * The end-user form, generated from the template's field list. Shared by the editor's
 * "Form & test" tab and the customer simulator.
 */
export function FieldForm({ fields, values, onChange, uploadImage, imageUrl, errors = {}, extra }: FieldFormProps) {
  const locale = useLocale();
  const t = useTranslations('form');
  const [uploading, setUploading] = useState<string | null>(null);

  const control = (f: Field) => {
    const v = values[f.key];
    const str = typeof v === 'string' || typeof v === 'number' ? String(v) : '';
    const c = f.constraints ?? {};
    switch (f.type) {
      case 'textarea':
        return <Textarea rows={Math.min(6, c.maxLines ?? 3)} maxLength={c.maxLength} value={str} onChange={(e) => onChange(f.key, e.target.value)} />;
      case 'number':
        return <Input type="number" value={str} min={c.min} max={c.max} onChange={(e) => onChange(f.key, e.target.value === '' ? undefined : Number(e.target.value))} />;
      case 'date':
        return <Input type="date" dir="ltr" value={str} onChange={(e) => onChange(f.key, e.target.value || undefined)} />;
      case 'phone':
        return <Input type="tel" dir="ltr" value={str} placeholder="+966 5x xxx xxxx" onChange={(e) => onChange(f.key, e.target.value)} />;
      case 'select':
        return (
          <Select value={str} onChange={(e) => onChange(f.key, e.target.value || undefined)}>
            <option value="">{t('choose')}</option>
            {(c.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {label(o.label, locale)}
              </option>
            ))}
          </Select>
        );
      case 'color':
        return c.allowedColors?.length ? (
          <div className="flex flex-wrap gap-2">
            {c.allowedColors.map((col) => (
              <button key={col} type="button" onClick={() => onChange(f.key, col)} className={`size-8 rounded-full ring-offset-2 ${str.toLowerCase() === col.toLowerCase() ? 'ring-2 ring-brand-600' : 'ring-1 ring-slate-200'}`} style={{ background: col }} aria-label={col} />
            ))}
          </div>
        ) : (
          <div className="flex gap-2" dir="ltr">
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(str) ? str : '#000000'} onChange={(e) => onChange(f.key, e.target.value)} className="h-9 w-12 rounded border border-slate-200" />
            <Input value={str} onChange={(e) => onChange(f.key, e.target.value)} />
          </div>
        );
      case 'image': {
        const img = v && typeof v === 'object' ? (v as ImageValue) : null;
        const url = img ? imageUrl(img.assetId) : undefined;
        return (
          <div className="flex items-center gap-3">
            <label className="flex size-20 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100">
              {uploading === f.key ? <Spinner /> : url ? <img src={url} alt="" className="size-full object-cover" /> : <ImagePlus className="size-6 text-slate-400" />}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(f.key);
                  try {
                    const a = await uploadImage(file);
                    onChange(f.key, { assetId: a.id });
                  } finally {
                    setUploading(null);
                    e.target.value = '';
                  }
                }}
              />
            </label>
            {img && (
              <button type="button" className="text-xs text-slate-500 hover:text-rose-600" onClick={() => onChange(f.key, undefined)}>
                <X className="inline size-3" /> {t('remove')}
              </button>
            )}
          </div>
        );
      }
      default:
        return <Input value={str} maxLength={c.maxLength} onChange={(e) => onChange(f.key, e.target.value)} />;
    }
  };

  return (
    <div className="space-y-4">
      {fields.map((f) => {
        const v = values[f.key];
        const len = typeof v === 'string' ? v.length : 0;
        return (
          <div key={f.key}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-medium text-slate-700">
                {label(f.label, locale)}
                {f.required && <span className="text-rose-500"> *</span>}
                {f.source !== 'user' && <span className="ms-1 text-[11px] font-normal text-brand-600">({t('fromBrand')})</span>}
              </span>
              {f.constraints?.maxLength && (f.type === 'text' || f.type === 'textarea') && (
                <span className={`text-[11px] tabular-nums ${len > f.constraints.maxLength ? 'text-rose-600' : 'text-slate-400'}`}>
                  {len}/{f.constraints.maxLength}
                </span>
              )}
            </div>
            {control(f)}
            {f.help && <p className="mt-1 text-xs text-slate-400">{label(f.help, locale)}</p>}
            {errors[f.key] && <p className="mt-1 text-xs text-rose-600">{errors[f.key]}</p>}
            {extra?.(f)}
          </div>
        );
      })}
    </div>
  );
}
