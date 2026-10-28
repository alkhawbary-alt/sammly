'use client';

import { useTranslations } from 'next-intl';
import { use, useState } from 'react';
import { AddLayerMenu } from '@/components/editor/AddLayerMenu';
import { Canvas } from '@/components/editor/Canvas';
import { FieldTab } from '@/components/editor/FieldTab';
import { FormTab } from '@/components/editor/FormTab';
import { LayerTab } from '@/components/editor/LayerTab';
import { LayerTree } from '@/components/editor/LayerTree';
import { SettingsTab } from '@/components/editor/SettingsTab';
import { TopBar } from '@/components/editor/TopBar';
import { useEditor } from '@/components/editor/useEditor';
import { VariantTabs } from '@/components/editor/VariantTabs';
import { ErrorNote, Spinner } from '@/components/ui';

const TABS = ['layer', 'field', 'form', 'settings'] as const;

export default function TemplateEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('editor');
  const ed = useEditor(id);
  const [tab, setTab] = useState<(typeof TABS)[number]>('layer');

  if (ed.query.error) return <div className="p-8"><ErrorNote error={ed.query.error} /></div>;
  if (!ed.draft || !ed.doc || !ed.meta) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar ed={ed} />
      <div className="flex min-h-0 flex-1">
        {/* Start pane: layers */}
        <aside className="flex w-64 shrink-0 flex-col border-e border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-2">
            <AddLayerMenu ed={ed} />
          </div>
          <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('layers')}</div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <LayerTree ed={ed} />
          </div>
        </aside>

        {/* Centre: canvas */}
        <section className="flex min-w-0 flex-1 flex-col">
          <VariantTabs ed={ed} />
          <Canvas ed={ed} />
        </section>

        {/* End pane: inspector */}
        <aside className="flex w-80 shrink-0 flex-col border-s border-slate-200 bg-white">
          <div className="flex border-b border-slate-200">
            {TABS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`flex-1 border-b-2 px-2 py-2.5 text-xs font-medium ${tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >
                {t(`tabs.${k}`)}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'layer' && <LayerTab ed={ed} />}
            {tab === 'field' && <FieldTab ed={ed} />}
            {tab === 'form' && <FormTab ed={ed} />}
            {tab === 'settings' && <SettingsTab ed={ed} />}
          </div>
        </aside>
      </div>
    </div>
  );
}
