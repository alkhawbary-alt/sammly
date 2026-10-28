'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { UploadFontModal, useFontFaces } from '@/components/fonts';
import type { FontRow } from '@/lib/types';
import { api } from '@/lib/api';
import { Badge, Button, Card, Input, Modal, PageHeader } from '@/components/ui';

const SAMPLE = 'صمملي — تصاميمك بلمسة 2026';

export default function FontsPage() {
  const t = useTranslations('fonts');
  const tc = useTranslations('common');
  const qc = useQueryClient();
  const { data: fonts = [] } = useQuery({ queryKey: ['fonts'], queryFn: () => api<FontRow[]>('/fonts') });
  useFontFaces(fonts);
  const [adding, setAdding] = useState(false);
  const [aliasFor, setAliasFor] = useState<FontRow | null>(null);
  const [alias, setAlias] = useState('');
  const invalidate = () => qc.invalidateQueries({ queryKey: ['fonts'] });

  const addAlias = useMutation({
    mutationFn: (f: FontRow) => api(`/fonts/${f.id}`, { method: 'PATCH', body: { aliases: [...f.aliases, alias.trim()] } }),
    onSuccess: () => {
      setAliasFor(null);
      setAlias('');
      invalidate();
    },
  });
  const removeAlias = useMutation({ mutationFn: ({ f, a }: { f: FontRow; a: string }) => api(`/fonts/${f.id}`, { method: 'PATCH', body: { aliases: f.aliases.filter((x) => x !== a) } }), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => api(`/fonts/${id}`, { method: 'DELETE' }), onSuccess: invalidate });

  const families = [...new Set(fonts.map((f) => f.family))];

  return (
    <div className="p-8">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Button onClick={() => setAdding(true)}>
            <Upload className="size-4" /> {t('upload')}
          </Button>
        }
      />
      <div className="space-y-6">
        {families.map((fam) => (
          <Card key={fam} className="overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 font-semibold">{fam}</div>
            {fonts
              .filter((f) => f.family === fam)
              .map((f) => (
                <div key={f.id} className="flex flex-wrap items-center gap-4 border-b border-slate-100 px-4 py-3 last:border-0">
                  <div className="w-16 text-sm tabular-nums text-slate-500">{f.weight}</div>
                  <div className="min-w-60 flex-1 truncate text-2xl" style={{ fontFamily: `lib-${f.id}`, fontWeight: f.weight }}>
                    {SAMPLE}
                  </div>
                  <div className="flex max-w-md flex-wrap items-center gap-1" dir="ltr">
                    {f.aliases.map((a) => (
                      <Badge key={a} tone="blue">
                        {a}
                        <button type="button" className="opacity-60 hover:opacity-100" onClick={() => removeAlias.mutate({ f, a })} aria-label="remove">
                          ×
                        </button>
                      </Badge>
                    ))}
                    <Button variant="ghost" size="sm" onClick={() => setAliasFor(f)}>
                      <Plus className="size-3" /> {t('alias')}
                    </Button>
                  </div>
                  {f.license && <Badge>{f.license}</Badge>}
                  <Button variant="ghost" size="sm" onClick={() => confirm(tc('confirmDelete')) && remove.mutate(f.id)}>
                    <Trash2 className="size-3.5 text-rose-500" />
                  </Button>
                </div>
              ))}
          </Card>
        ))}
      </div>

      <Modal open={!!aliasFor} onClose={() => setAliasFor(null)} title={t('addAlias')}>
        <p className="mb-3 text-sm text-slate-500">{t('aliasHelp')}</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (aliasFor && alias.trim()) addAlias.mutate(aliasFor);
          }}
        >
          <Input dir="ltr" autoFocus placeholder="Cairo-Bold" value={alias} onChange={(e) => setAlias(e.target.value)} />
          <Button type="submit" busy={addAlias.isPending}>
            {tc('add')}
          </Button>
        </form>
      </Modal>
      <UploadFontModal open={adding} onClose={() => setAdding(false)} onDone={invalidate} />
    </div>
  );
}
