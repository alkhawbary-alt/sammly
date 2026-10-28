'use client';

import { AlertTriangle, ArrowRight, CheckCircle2, Cloud, CloudOff, Copy, FileSearch, History, Loader2, Rocket, ShieldCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { localized } from '@/lib/types';
import { QaBadge, ImportReportView, type ImportView } from '@/components/templates/ImportReport';
import { Badge, Button, Empty, Modal } from '@/components/ui';
import type { Editor } from './useEditor';

interface Problem {
  code: string;
  message: string;
  path?: string;
}

const STATUS_TONE = { DRAFT: 'amber', PUBLISHED: 'green', ARCHIVED: 'slate' } as const;

export function TopBar({ ed }: { ed: Editor }) {
  const t = useTranslations('editor.top');
  const tt = useTranslations('templates');
  const locale = useLocale();
  const router = useRouter();
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [versions, setVersions] = useState<{ id: string; version: number; publishedAt: string; variants: { name: string }[] }[] | null>(null);
  const [report, setReport] = useState<ImportView | null>(null);
  const [published, setPublished] = useState<number | null>(null);
  const imports = ed.query.data?.imports ?? [];
  const latestQa = imports.find((i) => i.qaScore !== null)?.qaScore;

  const flush = async () => {
    // Wait for autosave so validate/publish see the latest draft.
    for (let i = 0; i < 40 && (ed.saveStateRef.current === 'dirty' || ed.saveStateRef.current === 'saving'); i++) await new Promise((r) => setTimeout(r, 250));
  };

  const validate = async () => {
    setBusy('validate');
    await flush();
    try {
      const r = await api<{ ok: boolean; problems: Problem[] }>(`/templates/${ed.id}/validate`, { method: 'POST' });
      setProblems(r.problems);
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    setBusy('publish');
    await flush();
    try {
      const r = await api<{ version: number }>(`/templates/${ed.id}/publish`, { method: 'POST' });
      ed.setStatus('PUBLISHED');
      setPublished(r.version);
    } catch (e) {
      const details = (e as { details?: Problem[] }).details;
      setProblems(Array.isArray(details) ? details : [{ code: 'ERROR', message: (e as Error).message }]);
    } finally {
      setBusy(null);
    }
  };

  const duplicate = async () => {
    setBusy('duplicate');
    await flush();
    try {
      const r = await api<{ id: string }>(`/templates/${ed.id}/duplicate`, { method: 'POST' });
      router.push(`/templates/${r.id}`);
    } finally {
      setBusy(null);
    }
  };

  const openReport = async (id: string) => setReport(await api<ImportView>(`/imports/${id}`));

  const save = {
    saved: { icon: Cloud, text: t('saved'), cls: 'text-slate-400' },
    dirty: { icon: Cloud, text: t('unsaved'), cls: 'text-amber-500' },
    saving: { icon: Loader2, text: t('saving'), cls: 'text-slate-400 [&>svg]:animate-spin' },
    conflict: { icon: CloudOff, text: t('conflict'), cls: 'text-rose-600' },
    error: { icon: CloudOff, text: t('saveError'), cls: 'text-rose-600' },
  }[ed.saveState];

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
      <Link href="/templates" className="rounded p-1.5 text-slate-400 hover:bg-slate-100" title={t('back')}>
        <ArrowRight className="size-4 ltr:rotate-180" />
      </Link>
      <div className="min-w-0">
        <div className="truncate font-semibold">{localized(ed.meta!.title, locale)}</div>
      </div>
      <Badge tone={STATUS_TONE[ed.status]}>{tt(`status.${ed.status}`)}</Badge>
      <QaBadge score={latestQa} />
      <span className={`flex items-center gap-1 text-xs ${save.cls}`}>
        <save.icon className="size-3.5" /> {save.text}
      </span>
      {ed.saveState === 'conflict' && (
        <Button size="sm" variant="secondary" onClick={ed.reload}>
          {t('reload')}
        </Button>
      )}
      <div className="ms-auto flex flex-wrap items-center gap-1.5">
        {imports.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => openReport(imports[0]!.id)}>
            <FileSearch className="size-3.5" /> {t('report')}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={async () => setVersions(await api(`/templates/${ed.id}/versions`))}>
          <History className="size-3.5" /> {t('versions')}
        </Button>
        <Button size="sm" variant="ghost" onClick={duplicate} busy={busy === 'duplicate'}>
          <Copy className="size-3.5" /> {t('duplicate')}
        </Button>
        <Button size="sm" variant="secondary" onClick={validate} busy={busy === 'validate'}>
          <ShieldCheck className="size-3.5" /> {t('validate')}
        </Button>
        <Button size="sm" onClick={publish} busy={busy === 'publish'}>
          <Rocket className="size-3.5" /> {t('publish')}
        </Button>
      </div>

      <Modal open={!!problems} onClose={() => setProblems(null)} title={t('validation')}>
        {problems?.length === 0 ? (
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="size-5" /> {t('noProblems')}
          </div>
        ) : (
          <ul className="space-y-2">
            {problems?.map((p, i) => (
              <li key={i} className="flex gap-2 rounded-lg bg-rose-50 p-2 text-sm text-rose-800">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <div>
                  <div>{t.has(`problems.${p.code}`) ? t(`problems.${p.code}`) : p.message}</div>
                  <div className="text-[11px] text-rose-500" dir="ltr">
                    {p.message}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>
      <Modal open={published !== null} onClose={() => setPublished(null)} title={t('publish')}>
        <div className="flex items-center gap-2 text-emerald-700">
          <CheckCircle2 className="size-5" /> {t('published', { version: published ?? 0 })}
        </div>
      </Modal>
      <Modal open={!!versions} onClose={() => setVersions(null)} title={t('versions')}>
        {versions?.length === 0 && <Empty>{t('noVersions')}</Empty>}
        <ul className="divide-y divide-slate-100">
          {versions?.map((v) => (
            <li key={v.id} className="flex items-center justify-between py-2 text-sm">
              <span className="font-medium">v{v.version}</span>
              <span className="text-slate-500">{v.variants.map((x) => x.name).join(' · ')}</span>
              <span className="text-xs text-slate-400">{new Date(v.publishedAt).toLocaleString(locale)}</span>
            </li>
          ))}
        </ul>
      </Modal>
      <Modal open={!!report} onClose={() => setReport(null)} title={t('report')} wide>
        {imports.length > 1 && (
          <div className="mb-3 flex gap-1">
            {imports.map((i) => (
              <Button key={i.id} size="sm" variant={report?.id === i.id ? 'primary' : 'secondary'} onClick={() => openReport(i.id)}>
                {i.fileName}
              </Button>
            ))}
          </div>
        )}
        {report && <ImportReportView imp={report} />}
      </Modal>
    </div>
  );
}
