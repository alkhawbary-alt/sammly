'use client';

import { ArrowDown, ArrowUp, Link2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FIELD_KEY_RE, BrandSource, type Binding, type BindingProp, type Field, type FieldType, type Layer } from '@sammly/template-schema';
import { Badge, Button, Checkbox, FieldRow, Input, Select, Textarea } from '@/components/ui';
import { Grid, Section } from './LayerTab';
import type { Editor } from './useEditor';

const TYPES_FOR: Record<Layer['type'], FieldType[]> = {
  text: ['text', 'textarea', 'phone', 'date', 'number', 'select'],
  imageSlot: ['image'],
  shape: ['color'],
  svg: ['color'],
  raster: [],
  image: [],
  group: [],
};

const PROPS_FOR: Record<FieldType, BindingProp[]> = {
  text: ['text', 'visible'],
  textarea: ['text', 'visible'],
  phone: ['text', 'visible'],
  date: ['text', 'visible'],
  number: ['text', 'visible'],
  select: ['text', 'visible'],
  image: ['image', 'visible'],
  color: ['fill', 'color', 'stroke'],
};

const slugKey = (s: string) => {
  const k = s.toLowerCase().replace(/^[@{\s]*(field:|zone:|slot:)?/, '').replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return FIELD_KEY_RE.test(k) ? k : '';
};

function defaultProp(type: FieldType, layer: Layer): BindingProp {
  if (type === 'image') return 'image';
  if (type === 'color') return layer.type === 'text' ? 'color' : 'fill';
  return 'text';
}

/** A new field definition for a layer, with sensible constraints from the designed content. */
export function fieldForLayer(layer: Layer, existing: string[], type?: FieldType, key?: string): Field {
  const t: FieldType = type ?? (layer.type === 'imageSlot' ? 'image' : layer.type === 'text' ? (layer.text.includes('\n') ? 'textarea' : 'text') : 'color');
  let k = key ?? (slugKey(layer.name) || (t === 'image' ? 'photo' : 'text'));
  for (let i = 2; existing.includes(k); i++) k = `${k.replace(/_\d+$/, '')}_${i}`;
  const sample = layer.type === 'text' ? layer.text : '';
  return {
    key: k,
    label: { ar: layer.name && !/^[@{]|^(field|zone|slot):/i.test(layer.name) ? layer.name.slice(0, 60) : k },
    type: t,
    required: t !== 'image',
    bindings: [{ layerId: layer.id, prop: defaultProp(t, layer) }],
    constraints: t === 'text' || t === 'textarea' ? { maxLength: Math.max(20, Math.ceil(sample.length * 1.6)), maxLines: t === 'textarea' ? Math.max(2, sample.split('\n').length) : undefined } : undefined,
    source: 'user',
    digits: 'western',
    ai: t === 'text' || t === 'textarea' ? { rewrite: true } : undefined,
    default: undefined,
  };
}

function FieldEditor({ ed, field }: { ed: Editor; field: Field }) {
  const t = useTranslations('editor.field');
  const [keyDraft, setKeyDraft] = useState(field.key);
  const set = (patch: Partial<Field>) => ed.updateField(field.key, patch);
  const c = field.constraints ?? {};
  const setC = (patch: Partial<NonNullable<Field['constraints']>>) => set({ constraints: { ...c, ...patch } });
  const layerName = (id: string) => ed.layers.find((l) => l.id === id)?.name ?? id;
  const isText = ['text', 'textarea'].includes(field.type);

  const setBindings = (bindings: Binding[]) => ed.updateField(field.key, {}, { bindingsHere: bindings });

  return (
    <div className="space-y-2">
      <Grid>
        <FieldRow label={t('key')} hint="a-z 0-9 _">
          <Input
            dir="ltr"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            onBlur={() => (FIELD_KEY_RE.test(keyDraft) && !ed.doc!.fields.some((f) => f.key === keyDraft) ? set({ key: keyDraft }) : setKeyDraft(field.key))}
          />
        </FieldRow>
        <FieldRow label={t('type')}>
          <Select value={field.type} onChange={(e) => set({ type: e.target.value as FieldType })}>
            {(['text', 'textarea', 'phone', 'date', 'number', 'select', 'image', 'color'] as const).map((x) => (
              <option key={x} value={x}>
                {t(`types.${x}`)}
              </option>
            ))}
          </Select>
        </FieldRow>
        <FieldRow label={t('labelAr')}>
          <Input value={field.label.ar} onChange={(e) => set({ label: { ...field.label, ar: e.target.value || ' ' } })} />
        </FieldRow>
        <FieldRow label={t('labelEn')}>
          <Input dir="ltr" value={field.label.en ?? ''} onChange={(e) => set({ label: { ...field.label, en: e.target.value || undefined } })} />
        </FieldRow>
      </Grid>
      <FieldRow label={t('help')}>
        <Input value={field.help?.ar ?? ''} onChange={(e) => set({ help: e.target.value ? { ar: e.target.value } : undefined })} />
      </FieldRow>
      <div className="flex flex-wrap gap-4">
        <Checkbox label={t('required')} checked={field.required} onChange={(v) => set({ required: v })} />
        {isText && <Checkbox label={t('aiRewrite')} checked={!!field.ai?.rewrite} onChange={(v) => set({ ai: v ? { rewrite: true } : undefined })} />}
      </div>
      <Grid>
        <FieldRow label={t('source')}>
          <Select value={field.source} onChange={(e) => set({ source: e.target.value as Field['source'] })}>
            <option value="user">{t('sources.user')}</option>
            {BrandSource.options.map((s) => (
              <option key={s} value={s}>
                {t(`sources.${s.replace('brand.', '')}`)}
              </option>
            ))}
          </Select>
        </FieldRow>
        {field.type !== 'image' && field.type !== 'color' && (
          <FieldRow label={t('digits')}>
            <Select value={field.digits} onChange={(e) => set({ digits: e.target.value as Field['digits'] })}>
              <option value="western">123</option>
              <option value="arabic">١٢٣</option>
            </Select>
          </FieldRow>
        )}
      </Grid>
      {field.type !== 'image' && (
        <FieldRow label={t('default')}>
          <Input value={typeof field.default === 'string' || typeof field.default === 'number' ? String(field.default) : ''} onChange={(e) => set({ default: e.target.value === '' ? undefined : field.type === 'number' ? Number(e.target.value) : e.target.value })} />
        </FieldRow>
      )}

      {/* Constraints by type */}
      {isText && (
        <Grid>
          <FieldRow label={t('maxLength')}>
            <Input type="number" min={1} value={c.maxLength ?? ''} onChange={(e) => setC({ maxLength: e.target.value ? Number(e.target.value) : undefined })} />
          </FieldRow>
          {field.type === 'textarea' && (
            <FieldRow label={t('maxLines')}>
              <Input type="number" min={1} value={c.maxLines ?? ''} onChange={(e) => setC({ maxLines: e.target.value ? Number(e.target.value) : undefined })} />
            </FieldRow>
          )}
        </Grid>
      )}
      {field.type === 'select' && (
        <FieldRow label={t('options')} hint={t('optionsHint')}>
          <Textarea
            rows={4}
            defaultValue={(c.options ?? []).map((o) => `${o.value}|${o.label.ar}`).join('\n')}
            onBlur={(e) =>
              setC({
                options: e.target.value
                  .split('\n')
                  .map((line) => line.split('|'))
                  .filter(([v]) => v?.trim())
                  .map(([v, l]) => ({ value: v!.trim(), label: { ar: (l ?? v)!.trim() } })),
              })
            }
          />
        </FieldRow>
      )}
      {field.type === 'color' && (
        <FieldRow label={t('allowedColors')} hint="#hex, …">
          <Input dir="ltr" defaultValue={(c.allowedColors ?? []).join(', ')} onBlur={(e) => setC({ allowedColors: e.target.value.split(/[,\s]+/).filter((x) => /^#[0-9a-f]{3,8}$/i.test(x)) })} />
        </FieldRow>
      )}
      {field.type === 'date' && (
        <FieldRow label={t('dateFormat')}>
          <Select value={c.dateFormat ?? 'gregorian'} onChange={(e) => setC({ dateFormat: e.target.value as 'hijri' | 'gregorian' | 'both' })}>
            <option value="gregorian">{t('dates.gregorian')}</option>
            <option value="hijri">{t('dates.hijri')}</option>
            <option value="both">{t('dates.both')}</option>
          </Select>
        </FieldRow>
      )}
      {field.type === 'image' && (
        <Grid>
          <FieldRow label={t('minWidth')}>
            <Input type="number" min={1} value={c.image?.minWidth ?? ''} onChange={(e) => setC({ image: { ...c.image, minWidth: e.target.value ? Number(e.target.value) : undefined } })} />
          </FieldRow>
          <FieldRow label={t('minHeight')}>
            <Input type="number" min={1} value={c.image?.minHeight ?? ''} onChange={(e) => setC({ image: { ...c.image, minHeight: e.target.value ? Number(e.target.value) : undefined } })} />
          </FieldRow>
        </Grid>
      )}

      <div>
        <div className="mb-1 text-xs font-medium text-slate-600">{t('bindings')}</div>
        <div className="space-y-1">
          {field.bindings.map((b, i) => (
            <div key={`${b.layerId}-${i}`} className="flex items-center gap-1.5 text-xs">
              <Link2 className="size-3 text-slate-400" />
              <button type="button" className="min-w-0 flex-1 truncate text-start hover:text-brand-700" onClick={() => ed.setSelectedId(b.layerId)}>
                {layerName(b.layerId)}
              </button>
              <Select className="!h-7 w-24 text-xs" value={b.prop} onChange={(e) => setBindings(field.bindings.map((x, j) => (j === i ? { ...x, prop: e.target.value as BindingProp } : x)))}>
                {PROPS_FOR[field.type].map((p) => (
                  <option key={p} value={p}>
                    {t(`props.${p}`)}
                  </option>
                ))}
              </Select>
              <button type="button" disabled={field.bindings.length === 1} className="rounded p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30" onClick={() => setBindings(field.bindings.filter((_, j) => j !== i))}>
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FieldTab({ ed }: { ed: Editor }) {
  const t = useTranslations('editor.field');
  const doc = ed.doc!;
  const l = ed.selected;
  const [open, setOpen] = useState<string | null>(null);
  const keys = doc.fields.map((f) => f.key);
  const otherVariantFields = (ed.draft?.variants ?? []).filter((v) => v.id !== ed.variantId).flatMap((v) => v.document.fields).filter((f, i, arr) => !keys.includes(f.key) && arr.findIndex((x) => x.key === f.key) === i);
  const boundHere = l ? doc.fields.filter((f) => f.bindings.some((b) => b.layerId === l.id)) : [];
  const allowed = l ? TYPES_FOR[l.type] : [];
  const imp = ed.query.data?.imports.find((i) => i.report && doc.meta.sourceFileName === i.fileName) ?? ed.query.data?.imports[0];
  const suggestions = (imp?.report?.suggestedFields ?? []).filter((s) => !keys.includes(s.key) && ed.layers.some((x) => x.id === s.layerId));

  const addField = (f: Field) => {
    ed.updateDoc((d) => d.fields.push(f));
    setOpen(f.key);
  };

  const bindExisting = (key: string, from?: Field) => {
    if (!l) return;
    const tmpl = from ?? doc.fields.find((f) => f.key === key)!;
    const binding: Binding = { layerId: l.id, prop: defaultProp(tmpl.type, l) };
    ed.updateDoc((d) => {
      const f = d.fields.find((x) => x.key === key);
      if (f) f.bindings.push(binding);
      else d.fields.push({ ...JSON.parse(JSON.stringify(tmpl)), bindings: [binding] });
    });
    setOpen(key);
  };

  const acceptSuggestion = (s: (typeof suggestions)[number]) => {
    const layer = ed.layers.find((x) => x.id === s.layerId);
    if (!layer) return;
    if (s.convertToSlot && (layer.type === 'raster' || layer.type === 'image')) {
      ed.updateLayer(layer.id, (x) => {
        const assetId = (x as { assetId: string }).assetId;
        Object.assign(x, { type: 'imageSlot', fit: 'cover', placeholderAssetId: assetId, allowUserCrop: true });
        delete (x as { assetId?: string }).assetId;
        delete (x as { clipping?: boolean }).clipping;
      });
      addField(fieldForLayer({ ...layer, type: 'imageSlot' } as unknown as Layer, keys, 'image', s.key));
    } else addField(fieldForLayer(layer, keys, s.type as FieldType, s.key));
  };

  const move = (i: number, dir: -1 | 1) =>
    ed.updateDoc((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.fields.length) return;
      [d.fields[i], d.fields[j]] = [d.fields[j]!, d.fields[i]!];
    });

  return (
    <div>
      {suggestions.length > 0 && (
        <Section title={t('suggestions')}>
          {suggestions.map((s) => (
            <div key={s.key} className="flex items-center gap-2 text-xs">
              <Sparkles className="size-3.5 text-brand-500" />
              <span className="flex-1" dir="ltr">
                {s.key} <span className="text-slate-400">· {s.type}</span>
              </span>
              <Button size="sm" variant="secondary" onClick={() => acceptSuggestion(s)}>
                {t('accept')}
              </Button>
            </div>
          ))}
        </Section>
      )}

      {l && (
        <Section title={t('thisLayer', { name: l.name })}>
          {boundHere.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {boundHere.map((f) => (
                <Badge key={f.key} tone="brand">
                  <button type="button" onClick={() => setOpen(f.key)}>
                    {f.key}
                  </button>
                </Badge>
              ))}
            </div>
          ) : allowed.length ? (
            <Button size="sm" onClick={() => addField(fieldForLayer(l, keys))}>
              <Plus className="size-3.5" /> {t('make')}
            </Button>
          ) : (
            <p className="text-xs text-slate-500">{l.type === 'raster' || l.type === 'image' ? t('rasterHelp') : t('notBindable')}</p>
          )}
          {allowed.length > 0 && (doc.fields.length > 0 || otherVariantFields.length > 0) && (
            <Select className="mt-2" value="" onChange={(e) => e.target.value && bindExisting(e.target.value, otherVariantFields.find((f) => f.key === e.target.value))}>
              <option value="">{t('bindExisting')}</option>
              {[...doc.fields.filter((f) => !boundHere.includes(f)), ...otherVariantFields].map((f) => (
                <option key={f.key} value={f.key}>
                  {f.key} — {f.label.ar}
                </option>
              ))}
            </Select>
          )}
        </Section>
      )}

      <Section title={t('all', { count: doc.fields.length })}>
        {doc.fields.length === 0 && <p className="text-xs text-slate-400">{t('empty')}</p>}
        {otherVariantFields.length > 0 && <p className="rounded bg-amber-50 p-2 text-[11px] text-amber-700">{t('missingHere', { keys: otherVariantFields.map((f) => f.key).join(', ') })}</p>}
        {doc.fields.map((f, i) => (
          <div key={f.key} className="rounded-lg border border-slate-200">
            <div className="flex items-center gap-1 px-2 py-1.5">
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-start text-sm" onClick={() => setOpen(open === f.key ? null : f.key)}>
                <span className="truncate font-medium">{f.label.ar}</span>
                <span className="text-xs text-slate-400" dir="ltr">
                  {f.key}
                </span>
                {f.required && <span className="text-rose-500">*</span>}
              </button>
              <Badge>{t(`types.${f.type}`)}</Badge>
              <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => move(i, -1)}>
                <ArrowUp className="size-3" />
              </button>
              <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => move(i, 1)}>
                <ArrowDown className="size-3" />
              </button>
              <button type="button" className="rounded p-1 text-slate-400 hover:text-rose-600" onClick={() => ed.updateDoc((d) => (d.fields = d.fields.filter((x) => x.key !== f.key)))}>
                <Trash2 className="size-3" />
              </button>
            </div>
            {open === f.key && (
              <div className="border-t border-slate-100 p-2">
                <FieldEditor ed={ed} field={f} />
              </div>
            )}
          </div>
        ))}
      </Section>
    </div>
  );
}
