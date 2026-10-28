'use client';

import { Play, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { buildValuesSchema, type FieldValues } from '@sammly/template-schema';
import { api, waitForJob } from '@/lib/api';
import { FieldForm } from '@/components/FieldForm';
import { Badge, Button, ErrorNote, Select } from '@/components/ui';
import { uploadImageAsset } from './AddLayerMenu';
import { Section } from './LayerTab';
import type { Editor } from './useEditor';

interface RenderResult {
  url: string;
  durationMs: number;
  overflow: string[];
  quality: string;
}

export function FormTab({ ed }: { ed: Editor }) {
  const t = useTranslations('editor.form');
  const doc = ed.doc!;
  const [quality, setQuality] = useState<'standard' | 'hd'>('standard');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RenderResult | null>(null);
  const [error, setError] = useState<unknown>(null);

  // Only keys this variant knows; validated with the same schema the API will use.
  const values = useMemo(() => Object.fromEntries(Object.entries(ed.values).filter(([k]) => doc.fields.some((f) => f.key === k))) as FieldValues, [ed.values, doc.fields]);
  const errors = useMemo(() => {
    if (!doc.fields.length) return {};
    const r = buildValuesSchema(doc.fields).safeParse(values);
    if (r.success) return {};
    const out: Record<string, string> = {};
    for (const issue of r.error.issues) {
      const k = String(issue.path[0] ?? '');
      if (k && !out[k]) out[k] = issue.message === 'Invalid input: expected string, received undefined' ? t('required') : issue.message;
    }
    return out;
  }, [doc.fields, values, t]);

  const testRender = async () => {
    setBusy(true);
    setError(null);
    try {
      const { jobId } = await api<{ jobId: string }>(`/templates/${ed.id}/test-render`, { method: 'POST', body: { variantId: ed.variantId, values, quality } });
      const job = await waitForJob(jobId);
      if (job.status === 'FAILED' || !job.url) throw new Error(job.error ?? 'Render failed');
      const r = job.result as { durationMs: number; overflow: string[] };
      setResult({ url: job.url, durationMs: r.durationMs, overflow: r.overflow, quality });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Section title={t('preview')}>
        <p className="text-xs text-slate-500">{t('help')}</p>
        {doc.fields.length === 0 ? (
          <p className="text-sm text-slate-400">{t('noFields')}</p>
        ) : (
          <FieldForm
            fields={doc.fields}
            values={ed.values}
            errors={errors}
            onChange={(k, v) => ed.setValues((cur) => ({ ...cur, [k]: v }))}
            uploadImage={async (file) => {
              const a = await uploadImageAsset(file, 'UPLOAD');
              ed.addAssetUrls({ [a.id]: a.url });
              return a;
            }}
            imageUrl={(id) => ed.assets[id]}
          />
        )}
        <Button variant="ghost" size="sm" onClick={() => ed.setValues({})}>
          <RotateCcw className="size-3.5" /> {t('reset')}
        </Button>
      </Section>
      <Section title={t('testRender')}>
        <div className="flex gap-2">
          <Select className="w-32" value={quality} onChange={(e) => setQuality(e.target.value as 'standard' | 'hd')}>
            <option value="standard">{t('standard')}</option>
            <option value="hd">HD (2×)</option>
          </Select>
          <Button onClick={testRender} busy={busy} className="flex-1">
            <Play className="size-3.5" /> {t('run')}
          </Button>
        </div>
        <ErrorNote error={error} />
        {result && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              <Badge tone="green">{t('duration', { ms: result.durationMs })}</Badge>
              <Badge>{result.quality}</Badge>
              {result.overflow.map((k) => (
                <Badge key={k} tone="red">
                  {t('overflow', { key: k })}
                </Badge>
              ))}
            </div>
            <a href={result.url} target="_blank" rel="noreferrer">
              <img src={result.url} alt="" className="w-full rounded-lg border border-slate-200" />
            </a>
          </div>
        )}
      </Section>
    </div>
  );
}
