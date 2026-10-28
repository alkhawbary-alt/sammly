'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { STANDARD_SIZES } from '@sammly/template-schema';
import { api, uploadFile, waitForJob } from '@/lib/api';
import { categoryName, categoryTree, type CategoryRow } from '@/lib/types';
import { Button, ErrorNote, FieldRow, Input, Modal, Select } from '@/components/ui';
import { ImportReportView, type ImportView } from './ImportReport';

type Step = 'form' | 'uploading' | 'importing' | 'review';

/** Runs a PSD upload + import and resolves with the finished import. */
export async function runPsdImport(file: File, onStep: (s: 'uploading' | 'importing', progress: number) => void): Promise<ImportView> {
  const sourceKey = await uploadFile('psd', file, (p) => onStep('uploading', p));
  onStep('importing', 0);
  const { importId, jobId } = await api<{ importId: string; jobId: string }>('/imports', { method: 'POST', body: { sourceKey, fileName: file.name } });
  const job = await waitForJob(jobId);
  const imp = await api<ImportView>(`/imports/${importId}`);
  if (job.status === 'FAILED') throw new Error(imp.error ?? job.error ?? 'Import failed');
  return imp;
}

export function NewTemplateModal({ mode, onClose, categories }: { mode: 'psd' | 'manual' | null; onClose: () => void; categories: CategoryRow[] }) {
  const t = useTranslations('templates');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const [titleAr, setTitleAr] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [size, setSize] = useState('square');
  const [custom, setCustom] = useState({ w: 1080, h: 1080 });
  const [step, setStep] = useState<Step>('form');
  const [progress, setProgress] = useState(0);
  const [imp, setImp] = useState<ImportView | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep('form');
    setImp(null);
    setError(null);
    setFile(null);
    setProgress(0);
    onClose();
  };

  const create = async (body: object) => {
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>('/templates', { method: 'POST', body: { title: { ar: titleAr || file?.name.replace(/\.psd$/i, '') || 'قالب جديد' }, categoryId: categoryId || null, ...body } });
      router.push(`/templates/${id}`);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  const startImport = async () => {
    if (!file) return;
    setError(null);
    try {
      const done = await runPsdImport(file, (s, p) => {
        setStep(s);
        setProgress(p);
      });
      setImp(done);
      setStep('review');
    } catch (e) {
      setError(e);
      setStep('form');
    }
  };

  const manual = () => {
    const s = STANDARD_SIZES.find((x) => x.id === size);
    create({ manual: { width: s?.width ?? custom.w, height: s?.height ?? custom.h } });
  };

  return (
    <Modal open={!!mode} onClose={reset} title={mode === 'psd' ? t('newPsd') : t('newManual')} wide={step === 'review'}>
      {step === 'review' && imp ? (
        <div className="space-y-4">
          <ImportReportView imp={imp} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={reset}>
              {tc('cancel')}
            </Button>
            <Button busy={busy} onClick={() => create({ fromImportId: imp.id })}>
              {t('openInEditor')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <FieldRow label={t('titleAr')}>
            <Input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} placeholder={mode === 'psd' ? t('titleFromFile') : ''} />
          </FieldRow>
          <FieldRow label={t('category')}>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{t('noCategory')}</option>
              {categoryTree(categories).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parentId ? '— ' : ''}
                  {categoryName(c, locale)}
                </option>
              ))}
            </Select>
          </FieldRow>
          {mode === 'psd' ? (
            <>
              <FieldRow label={t('psdFile')} hint={t('psdHint')}>
                <Input type="file" accept=".psd" disabled={step !== 'form'} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </FieldRow>
              <p className="rounded-lg bg-brand-50 p-3 text-xs leading-relaxed text-brand-700">{t('namingHelp')}</p>
              {step !== 'form' && (
                <div>
                  <div className="mb-1 text-xs text-slate-500">{step === 'uploading' ? t('uploading', { pct: Math.round(progress * 100) }) : t('importing')}</div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full bg-brand-500 transition-all ${step === 'importing' ? 'w-full animate-pulse' : ''}`} style={step === 'uploading' ? { width: `${progress * 100}%` } : undefined} />
                  </div>
                </div>
              )}
            </>
          ) : (
            <FieldRow label={t('size')}>
              <Select value={size} onChange={(e) => setSize(e.target.value)}>
                {STANDARD_SIZES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {t(`sizes.${s.id}`)} — {s.width}×{s.height}
                  </option>
                ))}
                <option value="custom">{t('sizes.custom')}</option>
              </Select>
              {size === 'custom' && (
                <div className="mt-2 flex gap-2" dir="ltr">
                  <Input type="number" min={100} max={5000} value={custom.w} onChange={(e) => setCustom({ ...custom, w: Number(e.target.value) })} />
                  <Input type="number" min={100} max={5000} value={custom.h} onChange={(e) => setCustom({ ...custom, h: Number(e.target.value) })} />
                </div>
              )}
            </FieldRow>
          )}
          <ErrorNote error={error} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={reset}>
              {tc('cancel')}
            </Button>
            {mode === 'psd' ? (
              <Button onClick={startImport} disabled={!file} busy={step !== 'form'}>
                {t('import')}
              </Button>
            ) : (
              <Button onClick={manual} busy={busy}>
                {t('create')}
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
