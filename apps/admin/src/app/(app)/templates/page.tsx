'use client';

import { useQuery } from '@tanstack/react-query';
import { FileImage, LayoutTemplate, Search, Square } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { categoryName, categoryTree, localized, type CategoryRow } from '@/lib/types';
import { Badge, Button, Card, Empty, Input, PageHeader, Select } from '@/components/ui';
import { NewTemplateModal } from '@/components/templates/NewTemplateModal';

interface TemplateRow {
  id: string;
  title: { ar: string; en?: string };
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  visibility: 'PUBLIC' | 'PRIVATE';
  minPlan: string;
  categoryId: string | null;
  variants: { id: string; name: string; width: number; height: number }[];
  fieldCount: number;
  thumbUrl: string | null;
  updatedAt: string;
}

const STATUS_TONE = { DRAFT: 'amber', PUBLISHED: 'green', ARCHIVED: 'slate' } as const;

export default function TemplatesPage() {
  const t = useTranslations('templates');
  const locale = useLocale();
  const [status, setStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState<'psd' | 'manual' | null>(null);
  const params = new URLSearchParams(Object.entries({ status, categoryId, q }).filter(([, v]) => v));
  const { data: rows, isLoading } = useQuery({ queryKey: ['templates', params.toString()], queryFn: () => api<TemplateRow[]>(`/templates?${params}`) });
  const { data: cats = [] } = useQuery({ queryKey: ['categories'], queryFn: () => api<CategoryRow[]>('/categories') });
  const catName = (id: string | null) => {
    const c = cats.find((x) => x.id === id);
    return c ? categoryName(c, locale) : t('noCategory');
  };

  return (
    <div className="p-8">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreating('manual')}>
              <Square className="size-4" /> {t('newManual')}
            </Button>
            <Button onClick={() => setCreating('psd')}>
              <FileImage className="size-4" /> {t('newPsd')}
            </Button>
          </>
        }
      />
      <div className="mb-5 flex flex-wrap gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute start-2.5 top-2.5 size-4 text-slate-400" />
          <Input className="ps-8" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('allStatuses')}</option>
          {(['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </Select>
        <Select className="w-52" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">{t('allCategories')}</option>
          {categoryTree(cats).map((c) => (
            <option key={c.id} value={c.id}>
              {c.parentId ? '— ' : ''}
              {categoryName(c, locale)}
            </option>
          ))}
        </Select>
      </div>

      {!isLoading && rows?.length === 0 && (
        <Empty>
          <LayoutTemplate className="mx-auto mb-2 size-8" />
          {t('empty')}
        </Empty>
      )}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {rows?.map((r) => (
          <Link key={r.id} href={`/templates/${r.id}`}>
            <Card className="group overflow-hidden transition-shadow hover:shadow-md">
              <div className="flex aspect-square items-center justify-center bg-[repeating-conic-gradient(#f1f5f9_0_25%,#fff_0_50%)] bg-[length:16px_16px]">
                {r.thumbUrl ? (
                  <img src={r.thumbUrl} alt="" className="max-h-full max-w-full object-contain" />
                ) : (
                  <LayoutTemplate className="size-10 text-slate-300" />
                )}
              </div>
              <div className="space-y-1.5 p-3">
                <div className="truncate font-medium group-hover:text-brand-700">{localized(r.title, locale)}</div>
                <div className="flex flex-wrap items-center gap-1">
                  <Badge tone={STATUS_TONE[r.status]}>{t(`status.${r.status}`)}</Badge>
                  <Badge>{catName(r.categoryId)}</Badge>
                  {r.visibility === 'PRIVATE' && <Badge tone="red">{t('private')}</Badge>}
                </div>
                <div className="text-xs text-slate-400">
                  {r.variants.map((v) => v.name).join(' · ')} — {t('fields', { count: r.fieldCount })}
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
      <NewTemplateModal mode={creating} onClose={() => setCreating(null)} categories={cats} />
    </div>
  );
}
