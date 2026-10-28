'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { api } from '@/lib/api';
import { categoryName, type CategoryRow } from '@/lib/types';
import { Badge, Button, Card, Checkbox, ErrorNote, FieldRow, Input, Modal, PageHeader, Select } from '@/components/ui';

type Draft = { id?: string; slug: string; ar: string; en: string; parentId: string; isActive: boolean };

export default function CategoriesPage() {
  const t = useTranslations('categories');
  const tc = useTranslations('common');
  const locale = useLocale();
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({ queryKey: ['categories'], queryFn: () => api<CategoryRow[]>('/categories') });
  const [edit, setEdit] = useState<Draft | null>(null);
  const [error, setError] = useState<unknown>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['categories'] });
  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const body = { slug: d.slug, name: { ar: d.ar, en: d.en || undefined }, parentId: d.parentId || null, isActive: d.isActive };
      return d.id ? api(`/categories/${d.id}`, { method: 'PATCH', body }) : api('/categories', { method: 'POST', body });
    },
    onSuccess: () => {
      setEdit(null);
      invalidate();
    },
    onError: setError,
  });
  const remove = useMutation({ mutationFn: (id: string) => api(`/categories/${id}`, { method: 'DELETE' }), onSuccess: invalidate, onError: (e) => alert((e as Error).message) });
  const reorder = useMutation({ mutationFn: (ids: string[]) => api('/categories/reorder', { method: 'POST', body: { ids } }), onSuccess: invalidate });

  const roots = rows.filter((r) => !r.parentId);
  const childrenOf = (id: string) => rows.filter((r) => r.parentId === id);

  const move = (list: CategoryRow[], i: number, dir: -1 | 1) => {
    const ids = list.map((r) => r.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    reorder.mutate(ids);
  };

  const renderRow = (c: CategoryRow, list: CategoryRow[], i: number, depth: number) => (
    <div key={c.id}>
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5" style={{ paddingInlineStart: 16 + depth * 28 }}>
        <div className="flex-1">
          <span className="font-medium">{categoryName(c, locale)}</span>
          <span className="ms-2 text-xs text-slate-400" dir="ltr">
            {c.slug}
          </span>
          {!c.isActive && <Badge className="ms-2">{t('inactive')}</Badge>}
        </div>
        <Badge tone="brand">{t('templates', { count: c.templateCount })}</Badge>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="sm" onClick={() => move(list, i, -1)} disabled={i === 0} aria-label="up">
            <ArrowUp className="size-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => move(list, i, 1)} disabled={i === list.length - 1} aria-label="down">
            <ArrowDown className="size-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEdit({ id: c.id, slug: c.slug, ar: c.name.ar, en: c.name.en ?? '', parentId: c.parentId ?? '', isActive: c.isActive })}>
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => confirm(tc('confirmDelete')) && remove.mutate(c.id)}>
            <Trash2 className="size-3.5 text-rose-500" />
          </Button>
        </div>
      </div>
      {childrenOf(c.id).map((ch, k, arr) => renderRow(ch, arr, k, depth + 1))}
    </div>
  );

  return (
    <div className="p-8">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Button onClick={() => setEdit({ slug: '', ar: '', en: '', parentId: '', isActive: true })}>
            <Plus className="size-4" /> {t('add')}
          </Button>
        }
      />
      <Card className="overflow-hidden">{roots.map((r, i) => renderRow(r, roots, i, 0))}</Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? t('edit') : t('add')}>
        {edit && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              save.mutate(edit);
            }}
          >
            <FieldRow label={t('nameAr')}>
              <Input required value={edit.ar} onChange={(e) => setEdit({ ...edit, ar: e.target.value })} />
            </FieldRow>
            <FieldRow label={t('nameEn')}>
              <Input dir="ltr" value={edit.en} onChange={(e) => setEdit({ ...edit, en: e.target.value })} />
            </FieldRow>
            <FieldRow label={t('slug')} hint="a-z 0-9 -">
              <Input dir="ltr" required pattern="[a-z0-9-]+" value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} />
            </FieldRow>
            <FieldRow label={t('parent')}>
              <Select value={edit.parentId} onChange={(e) => setEdit({ ...edit, parentId: e.target.value })}>
                <option value="">{t('noParent')}</option>
                {roots
                  .filter((r) => r.id !== edit.id)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {categoryName(r, locale)}
                    </option>
                  ))}
              </Select>
            </FieldRow>
            <Checkbox label={t('active')} checked={edit.isActive} onChange={(v) => setEdit({ ...edit, isActive: v })} />
            <ErrorNote error={error} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEdit(null)}>
                {tc('cancel')}
              </Button>
              <Button type="submit" busy={save.isPending}>
                {tc('save')}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
