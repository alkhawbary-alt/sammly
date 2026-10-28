'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge } from '@/components/ui';

export interface ImportReportData {
  counts: { total: number; editable: number; rasterized: number; merged: number; skipped: number };
  warnings: string[];
  missingFonts: { psdName: string; layers: string[] }[];
  suggestedFields: { key: string; type: string; layerId: string; layerName: string; sample?: string; convertToSlot?: boolean }[];
  layers: { path: string; type: string; status: string; notes?: string }[];
  durationMs: number;
}

export interface ImportView {
  id: string;
  status: string;
  fileName: string;
  error: string | null;
  qa: { score: number; warning: boolean; threshold: number; diffUrl: string | null; renderUrl: string | null } | null;
  report: ImportReportData | null;
  assets: Record<string, string>;
  document: { meta: { compositeAssetId?: string } } | null;
}

export function QaBadge({ score, threshold = 95 }: { score: number | null | undefined; threshold?: number }) {
  const t = useTranslations('import');
  if (score === null || score === undefined) return null;
  const ok = score >= threshold;
  return (
    <Badge tone={ok ? 'green' : 'amber'}>
      {ok ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
      {t('qa', { score: score.toFixed(1) })}
    </Badge>
  );
}

export function ImportReportView({ imp }: { imp: ImportView }) {
  const t = useTranslations('import');
  const [view, setView] = useState<'render' | 'composite' | 'diff'>('render');
  const r = imp.report;
  const compositeUrl = imp.document?.meta.compositeAssetId ? imp.assets[imp.document.meta.compositeAssetId] : undefined;
  const img = view === 'render' ? imp.qa?.renderUrl : view === 'diff' ? imp.qa?.diffUrl : compositeUrl;
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div>
        <div className="mb-2 flex gap-1">
          {(['render', 'composite', 'diff'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className={`rounded-md px-2.5 py-1 text-xs ${view === v ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {t(`view.${v}`)}
            </button>
          ))}
        </div>
        <div className="flex aspect-square items-center justify-center rounded-lg bg-slate-100">
          {img && <img src={img} alt="" className="max-h-full max-w-full object-contain" />}
        </div>
      </div>
      <div className="space-y-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{imp.fileName}</span>
          <QaBadge score={imp.qa?.score} threshold={imp.qa?.threshold} />
        </div>
        {imp.qa?.warning && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{t('qaWarning')}</p>}
        {r && (
          <>
            <div className="grid grid-cols-4 gap-2 text-center">
              {(['editable', 'rasterized', 'merged', 'skipped'] as const).map((k) => (
                <div key={k} className="rounded-lg bg-slate-50 p-2">
                  <div className="text-lg font-bold">{r.counts[k]}</div>
                  <div className="text-[11px] text-slate-500">{t(`counts.${k}`)}</div>
                </div>
              ))}
            </div>
            {r.missingFonts.length > 0 && (
              <div>
                <div className="mb-1 font-medium text-rose-700">{t('missingFonts')}</div>
                <ul className="space-y-1" dir="ltr">
                  {r.missingFonts.map((m) => (
                    <li key={m.psdName} className="flex items-center justify-between rounded bg-rose-50 px-2 py-1 text-xs">
                      <span className="font-mono">{m.psdName}</span>
                      <span className="text-rose-500">{m.layers.length} layer(s)</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-slate-500">{t('missingFontsHelp')}</p>
              </div>
            )}
            {r.suggestedFields.length > 0 && (
              <div>
                <div className="mb-1 font-medium">{t('suggested')}</div>
                <div className="flex flex-wrap gap-1" dir="ltr">
                  {r.suggestedFields.map((s) => (
                    <Badge key={s.key} tone="brand">
                      {s.key} · {s.type}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {r.warnings.length > 0 && (
              <details>
                <summary className="cursor-pointer font-medium text-amber-700">{t('warnings', { count: r.warnings.length })}</summary>
                <ul className="mt-1 list-disc space-y-0.5 ps-5 text-xs text-slate-600" dir="ltr">
                  {r.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}
