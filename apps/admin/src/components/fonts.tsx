'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { api, uploadFile } from '@/lib/api';
import type { FontRow } from '@/lib/types';
import { Button, ErrorNote, FieldRow, Input, Modal, Select } from './ui';

/** Loads library fonts into the admin document so previews/samples use the real files. */
export function useFontFaces(fonts: Pick<FontRow, 'id' | 'url' | 'weight' | 'style'>[] | undefined) {
  useEffect(() => {
    for (const f of fonts ?? []) {
      const family = `lib-${f.id}`;
      if ([...document.fonts].some((x) => x.family === family)) continue;
      const face = new FontFace(family, `url(${f.url})`, { weight: String(f.weight), style: f.style });
      document.fonts.add(face);
      face.load().catch(() => {});
    }
  }, [fonts]);
}

export function UploadFontModal({ open, onClose, onDone, presetAlias }: { open: boolean; onClose: () => void; onDone: (fontId: string) => void; presetAlias?: string }) {
  const t = useTranslations('fonts');
  const tc = useTranslations('common');
  const [file, setFile] = useState<File | null>(null);
  const [family, setFamily] = useState('');
  const [weight, setWeight] = useState(400);
  const [aliases, setAliases] = useState(presetAlias ?? '');
  const [license, setLicense] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => setAliases(presetAlias ?? ''), [presetAlias]);

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const sourceKey = await uploadFile('font', file);
      const f = await api<{ id: string }>('/fonts', {
        method: 'POST',
        body: { sourceKey, family: family || file.name.replace(/\.[^.]+$/, ''), weight, aliases: aliases.split(/[,\n]/).map((a) => a.trim()).filter(Boolean), scripts: ['arabic', 'latin'], license: license || undefined },
      });
      onDone(f.id);
      onClose();
      setFile(null);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('upload')}>
      <div className="space-y-3">
        <FieldRow label={t('file')} hint=".ttf .otf .woff2">
          <Input type="file" accept=".ttf,.otf,.woff2" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </FieldRow>
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label={t('family')}>
            <Input dir="ltr" value={family} placeholder="Cairo" onChange={(e) => setFamily(e.target.value)} />
          </FieldRow>
          <FieldRow label={t('weight')}>
            <Select value={weight} onChange={(e) => setWeight(Number(e.target.value))}>
              {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </Select>
          </FieldRow>
        </div>
        <FieldRow label={t('aliases')} hint={t('aliasesHint')}>
          <Input dir="ltr" value={aliases} placeholder="Cairo-Bold" onChange={(e) => setAliases(e.target.value)} />
        </FieldRow>
        <FieldRow label={t('license')}>
          <Input dir="ltr" value={license} placeholder="OFL-1.1" onChange={(e) => setLicense(e.target.value)} />
        </FieldRow>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button onClick={submit} busy={busy} disabled={!file}>
            {t('upload')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
