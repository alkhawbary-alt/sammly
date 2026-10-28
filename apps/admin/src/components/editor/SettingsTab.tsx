'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import type { TemplateRules } from '@sammly/template-schema';
import { api } from '@/lib/api';
import { categoryName, categoryTree, type CategoryRow } from '@/lib/types';
import { Checkbox, FieldRow, Input, Select, Textarea } from '@/components/ui';
import { Section } from './LayerTab';
import type { Editor, TemplateMeta } from './useEditor';

export function SettingsTab({ ed }: { ed: Editor }) {
  const t = useTranslations('editor.settings');
  const locale = useLocale();
  const { data: cats = [] } = useQuery({ queryKey: ['categories'], queryFn: () => api<CategoryRow[]>('/categories') });
  const meta = ed.meta!;
  const rules = ed.draft!.variants[0]!.document.rules;
  const pending = useRef<Partial<TemplateMeta>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Metadata lives on the Template row: PATCH (debounced).
  const setMeta = (patch: Partial<TemplateMeta>) => {
    ed.setMeta({ ...meta, ...patch });
    pending.current = { ...pending.current, ...patch };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const body = pending.current;
      pending.current = {};
      api(`/templates/${ed.id}`, { method: 'PATCH', body }).catch((e) => alert((e as Error).message));
    }, 600);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  // Rules are identical in every variant.
  const setRules = (patch: Partial<TemplateRules>) =>
    ed.update((d) => {
      for (const v of d.variants) v.document.rules = { ...v.document.rules, ...patch };
    });

  return (
    <div>
      <Section title={t('general')}>
        <FieldRow label={t('titleAr')}>
          <Input value={meta.title.ar} onChange={(e) => setMeta({ title: { ...meta.title, ar: e.target.value } })} />
        </FieldRow>
        <FieldRow label={t('titleEn')}>
          <Input dir="ltr" value={meta.title.en ?? ''} onChange={(e) => setMeta({ title: { ...meta.title, en: e.target.value || undefined } })} />
        </FieldRow>
        <FieldRow label={t('category')}>
          <Select value={meta.categoryId ?? ''} onChange={(e) => setMeta({ categoryId: e.target.value || null })}>
            <option value="">—</option>
            {categoryTree(cats).map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentId ? '— ' : ''}
                {categoryName(c, locale)}
              </option>
            ))}
          </Select>
        </FieldRow>
        <FieldRow label={t('tags')} hint={t('commaSeparated')}>
          <Input defaultValue={meta.tags.join('، ')} onBlur={(e) => setMeta({ tags: e.target.value.split(/[,،]/).map((s) => s.trim()).filter(Boolean) })} />
        </FieldRow>
      </Section>
      <Section title={t('access')}>
        <FieldRow label={t('minPlan')}>
          <Select value={meta.minPlan} onChange={(e) => setMeta({ minPlan: e.target.value as TemplateMeta['minPlan'] })}>
            {(['BASIC', 'BUSINESS', 'PRO'] as const).map((p) => (
              <option key={p} value={p}>
                {t(`plans.${p}`)}
              </option>
            ))}
          </Select>
        </FieldRow>
        <FieldRow label={t('visibility')}>
          <Select value={meta.visibility} onChange={(e) => setMeta({ visibility: e.target.value as TemplateMeta['visibility'] })}>
            <option value="PUBLIC">{t('public')}</option>
            <option value="PRIVATE">{t('private')}</option>
          </Select>
        </FieldRow>
        {meta.visibility === 'PRIVATE' && <p className="text-[11px] text-slate-500">{t('privateHelp')}</p>}
        <FieldRow label={t('activityTypes')} hint={t('activityHint')}>
          <Input defaultValue={meta.activityTypes.join('، ')} onBlur={(e) => setMeta({ activityTypes: e.target.value.split(/[,،]/).map((s) => s.trim()).filter(Boolean) })} />
        </FieldRow>
      </Section>
      <Section title={t('rules')}>
        <Checkbox label={t('lockBrand')} checked={rules.lockBrandFields} onChange={(v) => setRules({ lockBrandFields: v })} />
        <FieldRow label={t('aiLevel')}>
          <Select value={rules.aiPolicy.level} onChange={(e) => setRules({ aiPolicy: { ...rules.aiPolicy, level: e.target.value as TemplateRules['aiPolicy']['level'] } })}>
            <option value="none">{t('ai.none')}</option>
            <option value="text">{t('ai.text')}</option>
            <option value="text+image">{t('ai.textImage')}</option>
          </Select>
        </FieldRow>
        <FieldRow label={t('aiInstructions')}>
          <Textarea rows={5} placeholder={t('aiPlaceholder')} value={rules.aiPolicy.instructions ?? ''} onChange={(e) => setRules({ aiPolicy: { ...rules.aiPolicy, instructions: e.target.value || undefined } })} />
        </FieldRow>
        <div>
          <div className="mb-1 text-xs font-medium text-slate-600">{t('exportSizes')}</div>
          <p className="mb-1.5 text-[11px] text-slate-400">{t('exportSizesHelp')}</p>
          {ed.draft!.variants.map((v) => (
            <Checkbox
              key={v.id}
              label={`${v.name} (${v.width}×${v.height})`}
              checked={rules.exportSizes.length === 0 || rules.exportSizes.includes(v.id)}
              onChange={(on) => {
                const all = ed.draft!.variants.map((x) => x.id);
                const cur = rules.exportSizes.length ? rules.exportSizes : all;
                const next = on ? [...new Set([...cur, v.id])] : cur.filter((x) => x !== v.id);
                setRules({ exportSizes: next.length === all.length ? [] : next });
              }}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}
