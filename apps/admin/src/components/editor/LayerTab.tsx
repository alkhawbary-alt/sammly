'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ImagePlus, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { walkLayers, type ImageSlotLayer, type Layer, type TextLayer } from '@sammly/template-schema';
import { api } from '@/lib/api';
import type { FontRow } from '@/lib/types';
import { UploadFontModal } from '@/components/fonts';
import { Button, Checkbox, FieldRow, Input, Select, Textarea } from '@/components/ui';
import { uploadImageAsset } from './AddLayerMenu';
import type { Editor } from './useEditor';

const num = (v: string) => (v === '' ? 0 : Number(v));

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2 border-b border-slate-100 p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </section>
  );
}

function ColorInput({ value, onChange }: { value: string | undefined; onChange: (v: string) => void }) {
  const hex = value && /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
  return (
    <div className="flex gap-1.5" dir="ltr">
      <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} className="h-9 w-10 cursor-pointer rounded border border-slate-200" />
      <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function useFontLibrary() {
  return useQuery({ queryKey: ['fonts'], queryFn: () => api<FontRow[]>('/fonts') });
}

function FontPicker({ ed, layer }: { ed: Editor; layer: TextLayer }) {
  const t = useTranslations('editor.layer');
  const qc = useQueryClient();
  const { data: fonts = [] } = useFontLibrary();
  const [uploading, setUploading] = useState(false);
  const mapped = layer.style.fontId && fonts.some((f) => f.id === layer.style.fontId);
  const psdName = layer.style.fontFamily;

  /** Map this PSD font everywhere in the template and remember the alias for future imports. */
  const mapFont = async (fontId: string) => {
    const font = fonts.find((f) => f.id === fontId) ?? (await api<FontRow[]>('/fonts')).find((f) => f.id === fontId);
    if (!font) return;
    ed.addFonts({ [font.id]: { family: font.family, weight: font.weight, style: font.style === 'italic' ? 'italic' : 'normal', url: font.url } });
    const unmappedName = !mapped ? psdName : null;
    ed.update((d) => {
      for (const v of d.variants)
        for (const l of walkLayers(v.document.layers)) {
          if (l.type !== 'text') continue;
          if (l.id === layer.id || (unmappedName && l.style.fontFamily === unmappedName && !l.style.fontId)) {
            l.style.fontId = font.id;
            l.style.fontWeight = font.weight;
          }
        }
    });
    if (unmappedName && !font.aliases.includes(unmappedName) && /^[\w.-]+$/.test(unmappedName)) {
      await api(`/fonts/${font.id}`, { method: 'PATCH', body: { aliases: [...font.aliases, unmappedName] } }).catch(() => {});
      qc.invalidateQueries({ queryKey: ['fonts'] });
    }
  };

  return (
    <div className="space-y-1.5">
      {!mapped && (
        <div className="flex items-start gap-1.5 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {t('unmapped')} <b dir="ltr">{psdName}</b>
          </span>
        </div>
      )}
      <Select value={mapped ? layer.style.fontId : ''} onChange={(e) => e.target.value && mapFont(e.target.value)}>
        <option value="">{t('pickFont')}</option>
        {fonts.map((f) => (
          <option key={f.id} value={f.id}>
            {f.family} {f.weight}
          </option>
        ))}
      </Select>
      {!mapped && (
        <Button variant="ghost" size="sm" onClick={() => setUploading(true)}>
          <Upload className="size-3.5" /> {t('uploadFont')}
        </Button>
      )}
      <UploadFontModal
        open={uploading}
        onClose={() => setUploading(false)}
        presetAlias={psdName}
        onDone={async (id) => {
          await qc.invalidateQueries({ queryKey: ['fonts'] });
          await mapFont(id);
        }}
      />
    </div>
  );
}

function TextProps({ ed, l }: { ed: Editor; l: TextLayer }) {
  const t = useTranslations('editor.layer');
  const set = (patch: (x: TextLayer) => void) => ed.updateLayer(l.id, (x) => patch(x as TextLayer));
  return (
    <>
      <Section title={t('text')}>
        <Textarea rows={3} value={l.text} dir={l.direction === 'ltr' ? 'ltr' : 'rtl'} onChange={(e) => set((x) => ((x.text = e.target.value), (x.runs = undefined)))} />
        {l.runs && <p className="text-[11px] text-amber-600">{t('runsNote')}</p>}
        <Grid>
          <FieldRow label={t('direction')}>
            <Select value={l.direction} onChange={(e) => set((x) => (x.direction = e.target.value as TextLayer['direction']))}>
              <option value="rtl">RTL</option>
              <option value="ltr">LTR</option>
              <option value="auto">Auto</option>
            </Select>
          </FieldRow>
          <FieldRow label={t('textBox')}>
            <Select value={l.textBox} onChange={(e) => set((x) => (x.textBox = e.target.value as TextLayer['textBox']))}>
              <option value="point">{t('point')}</option>
              <option value="box">{t('box')}</option>
            </Select>
          </FieldRow>
          <FieldRow label={t('align')}>
            <Select value={l.style.align} onChange={(e) => set((x) => (x.style.align = e.target.value as TextLayer['style']['align']))}>
              {(['start', 'center', 'end', 'justify'] as const).map((a) => (
                <option key={a} value={a}>
                  {t(`aligns.${a}`)}
                </option>
              ))}
            </Select>
          </FieldRow>
          <FieldRow label={t('verticalAlign')}>
            <Select value={l.verticalAlign} onChange={(e) => set((x) => ((x.verticalAlign = e.target.value as TextLayer['verticalAlign']), e.target.value !== 'top' && (x.baseline = undefined)))}>
              <option value="top">{t('valign.top')}</option>
              <option value="middle">{t('valign.middle')}</option>
              <option value="bottom">{t('valign.bottom')}</option>
            </Select>
          </FieldRow>
        </Grid>
      </Section>
      <Section title={t('font')}>
        <FontPicker ed={ed} layer={l} />
        <Grid>
          <FieldRow label={t('size')}>
            <Input type="number" min={1} value={l.style.fontSize} onChange={(e) => set((x) => (x.style.fontSize = Math.max(1, num(e.target.value))))} />
          </FieldRow>
          <FieldRow label={t('lineHeight')}>
            <Input type="number" min={0} value={l.style.lineHeight ?? ''} placeholder="auto" onChange={(e) => set((x) => (x.style.lineHeight = e.target.value ? num(e.target.value) : undefined))} />
          </FieldRow>
        </Grid>
        <FieldRow label={t('color')}>
          <ColorInput value={l.style.color} onChange={(v) => set((x) => (x.style.color = v))} />
        </FieldRow>
      </Section>
      <Section title={t('fit')}>
        <Grid>
          <FieldRow label={t('fitMode')}>
            <Select value={l.fit.mode} onChange={(e) => set((x) => (x.fit.mode = e.target.value as TextLayer['fit']['mode']))}>
              <option value="none">{t('fitModes.none')}</option>
              <option value="shrink">{t('fitModes.shrink')}</option>
              <option value="wrap-shrink">{t('fitModes.wrap-shrink')}</option>
            </Select>
          </FieldRow>
          <FieldRow label={t('minSize')}>
            <Input type="number" min={1} value={Math.round(l.fit.minFontSize)} onChange={(e) => set((x) => (x.fit.minFontSize = Math.max(1, num(e.target.value))))} />
          </FieldRow>
          <FieldRow label={t('maxLines')}>
            <Input type="number" min={1} value={l.fit.maxLines ?? ''} onChange={(e) => set((x) => (x.fit.maxLines = e.target.value ? num(e.target.value) : undefined))} />
          </FieldRow>
        </Grid>
      </Section>
    </>
  );
}

function SlotProps({ ed, l }: { ed: Editor; l: ImageSlotLayer }) {
  const t = useTranslations('editor.layer');
  const set = (patch: (x: ImageSlotLayer) => void) => ed.updateLayer(l.id, (x) => patch(x as ImageSlotLayer));
  const [busy, setBusy] = useState(false);
  const maskKind = l.mask ? (l.mask.kind === 'shape' ? l.mask.shape : l.mask.kind) : 'none';

  const upload = async (file: File | undefined, apply: (id: string) => void) => {
    if (!file) return;
    setBusy(true);
    try {
      const img = await uploadImageAsset(file);
      ed.addAssetUrls({ [img.id]: img.url });
      apply(img.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={t('slot')}>
      <Grid>
        <FieldRow label={t('fitImage')}>
          <Select value={l.fit} onChange={(e) => set((x) => (x.fit = e.target.value as ImageSlotLayer['fit']))}>
            <option value="cover">{t('cover')}</option>
            <option value="contain">{t('contain')}</option>
          </Select>
        </FieldRow>
        <FieldRow label={t('mask')}>
          <Select
            value={maskKind}
            onChange={(e) =>
              set((x) => {
                const v = e.target.value;
                if (v === 'none') x.mask = undefined;
                else if (v === 'circle' || v === 'roundedRect') x.mask = { kind: 'shape', shape: v, radius: v === 'roundedRect' ? 32 : undefined };
                else if (v === 'path') x.mask = { kind: 'path', svgPath: `M0 0 L${Math.round(x.width)} 0 L${Math.round(x.width)} ${Math.round(x.height)} L0 ${Math.round(x.height)} Z` };
              })
            }
          >
            <option value="none">{t('masks.none')}</option>
            <option value="circle">{t('masks.circle')}</option>
            <option value="roundedRect">{t('masks.roundedRect')}</option>
            <option value="alpha" disabled={maskKind !== 'alpha'}>
              {t('masks.alpha')}
            </option>
            <option value="path">{t('masks.path')}</option>
          </Select>
        </FieldRow>
      </Grid>
      {l.mask?.kind === 'shape' && l.mask.shape === 'roundedRect' && (
        <FieldRow label={t('radius')}>
          <Input type="number" min={0} value={l.mask.radius ?? 0} onChange={(e) => set((x) => x.mask?.kind === 'shape' && (x.mask.radius = num(e.target.value)))} />
        </FieldRow>
      )}
      {l.mask?.kind === 'path' && (
        <FieldRow label={t('svgPath')}>
          <Textarea dir="ltr" rows={3} className="font-mono text-xs" value={l.mask.svgPath} onChange={(e) => set((x) => x.mask?.kind === 'path' && (x.mask.svgPath = e.target.value))} />
        </FieldRow>
      )}
      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 p-2 text-xs text-slate-600 hover:bg-slate-50">
        <ImagePlus className="size-4" /> {t('uploadMask')}
        <input type="file" accept="image/png" className="hidden" onChange={(e) => upload(e.target.files?.[0], (id) => set((x) => (x.mask = { kind: 'alpha', assetId: id })))} />
      </label>
      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 p-2 text-xs text-slate-600 hover:bg-slate-50">
        <ImagePlus className="size-4" /> {l.placeholderAssetId ? t('replacePlaceholder') : t('uploadPlaceholder')}
        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0], (id) => set((x) => (x.placeholderAssetId = id)))} />
      </label>
      {busy && <p className="text-xs text-slate-400">…</p>}
      <FieldRow label={t('emptyColor')}>
        <ColorInput value={l.emptyColor} onChange={(v) => set((x) => (x.emptyColor = v || undefined))} />
      </FieldRow>
      <Checkbox label={t('allowCrop')} checked={l.allowUserCrop} onChange={(v) => set((x) => (x.allowUserCrop = v))} />
    </Section>
  );
}

export function LayerTab({ ed }: { ed: Editor }) {
  const t = useTranslations('editor.layer');
  const l = ed.selected;
  if (!l) return <p className="p-4 text-sm text-slate-400">{t('none')}</p>;
  const geo = (k: 'x' | 'y' | 'width' | 'height' | 'rotation') => (
    <FieldRow label={t(k)}>
      <Input type="number" value={Math.round(l[k] * 100) / 100} onChange={(e) => ed.updateLayer(l.id, { [k]: num(e.target.value) } as Partial<Layer>)} />
    </FieldRow>
  );

  const convertToSlot = () => {
    if (l.type !== 'raster' && l.type !== 'image') return;
    ed.updateLayer(l.id, (x) => {
      const assetId = (x as { assetId: string }).assetId;
      Object.assign(x, { type: 'imageSlot', fit: 'cover', placeholderAssetId: assetId, allowUserCrop: true });
      delete (x as { assetId?: string }).assetId;
      delete (x as { clipping?: boolean }).clipping;
    });
  };

  const remove = () => {
    ed.updateDoc((doc) => {
      const strip = (ls: Layer[]): Layer[] => ls.filter((x) => x.id !== l.id).map((x) => (x.type === 'group' ? { ...x, children: strip(x.children) } : x));
      doc.layers = strip(doc.layers);
      doc.fields = doc.fields.map((f) => ({ ...f, bindings: f.bindings.filter((b) => b.layerId !== l.id) })).filter((f) => f.bindings.length > 0);
    });
    ed.setSelectedId(null);
  };

  return (
    <div>
      <Section title={t('general')}>
        <FieldRow label={t('name')}>
          <Input value={l.name} onChange={(e) => ed.updateLayer(l.id, { name: e.target.value })} />
        </FieldRow>
        <Grid>
          {geo('x')}
          {geo('y')}
          {geo('width')}
          {geo('height')}
          {geo('rotation')}
          <FieldRow label={t('opacity')}>
            <Input type="number" min={0} max={1} step={0.05} value={l.opacity} onChange={(e) => ed.updateLayer(l.id, { opacity: Math.min(1, Math.max(0, num(e.target.value))) })} />
          </FieldRow>
        </Grid>
        <div className="flex gap-4">
          <Checkbox label={t('visible')} checked={l.visible} onChange={(v) => ed.updateLayer(l.id, { visible: v })} />
          <Checkbox label={t('locked')} checked={l.locked} onChange={(v) => ed.updateLayer(l.id, { locked: v })} />
        </div>
        {l.locked && <p className="text-[11px] text-slate-400">{t('lockedHelp')}</p>}
      </Section>
      {l.type === 'text' && <TextProps ed={ed} l={l} />}
      {l.type === 'imageSlot' && <SlotProps ed={ed} l={l} />}
      {l.type === 'shape' && (
        <Section title={t('shape')}>
          <FieldRow label={t('fill')}>
            <ColorInput value={l.fill} onChange={(v) => ed.updateLayer(l.id, { fill: v } as Partial<Layer>)} />
          </FieldRow>
          <FieldRow label={t('radius')}>
            <Input type="number" min={0} value={l.radius} onChange={(e) => ed.updateLayer(l.id, { radius: num(e.target.value) } as Partial<Layer>)} />
          </FieldRow>
        </Section>
      )}
      {(l.type === 'raster' || l.type === 'image') && (
        <Section title={t('image')}>
          <p className="text-xs text-slate-500">{t('convertHelp')}</p>
          <Button variant="secondary" size="sm" onClick={convertToSlot}>
            <ImagePlus className="size-3.5" /> {t('convertToSlot')}
          </Button>
        </Section>
      )}
      <div className="p-3">
        <Button variant="ghost" size="sm" className="text-rose-600" onClick={remove}>
          <Trash2 className="size-3.5" /> {t('delete')}
        </Button>
      </div>
    </div>
  );
}

export { Section, Grid, ColorInput };
