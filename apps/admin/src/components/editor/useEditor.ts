'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { walkLayers, type Field, type Layer, type TemplateDocument, type TemplateDraft, type FieldValues } from '@sammly/template-schema';
import { ApiError, api } from '@/lib/api';
import type { ImportReportData } from '@/components/templates/ImportReport';

export interface FontInfo {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  url: string;
}

export interface TemplateMeta {
  title: { ar: string; en?: string };
  categoryId: string | null;
  tags: string[];
  minPlan: 'BASIC' | 'BUSINESS' | 'PRO';
  visibility: 'PUBLIC' | 'PRIVATE';
  activityTypes: string[];
}

export interface TemplateView extends TemplateMeta {
  id: string;
  slug: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  currentVersionId: string | null;
  revision: number;
  draft: TemplateDraft;
  assets: Record<string, string>;
  fonts: Record<string, FontInfo>;
  access: string[];
  imports: { id: string; fileName: string; status: string; qaScore: number | null; diffUrl: string | null; report: ImportReportData | null; createdAt: string }[];
}

export type SaveState = 'saved' | 'dirty' | 'saving' | 'conflict' | 'error';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Field properties shared by every variant (bindings are per variant). */
const SHARED_FIELD_PROPS = ['label', 'help', 'type', 'required', 'default', 'constraints', 'source', 'digits', 'ai'] as const;

export function useEditor(id: string) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['template', id], queryFn: () => api<TemplateView>(`/templates/${id}`), refetchOnMount: 'always' });

  const [meta, setMeta] = useState<TemplateMeta | null>(null);
  const [status, setStatus] = useState<TemplateView['status']>('DRAFT');
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [revision, setRevision] = useState(0);
  const [assets, setAssets] = useState<Record<string, string>>({});
  const [fonts, setFonts] = useState<Record<string, FontInfo>>({});
  const [variantId, setVariantId] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [values, setValues] = useState<FieldValues>({});
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const loadedRef = useRef(false);
  const saveStateRef = useRef<SaveState>('saved');
  saveStateRef.current = saveState;
  const revisionRef = useRef(0);
  revisionRef.current = revision;

  // Hydrate once (and again after a conflict reload).
  useEffect(() => {
    const d = query.data;
    if (!d || loadedRef.current) return;
    loadedRef.current = true;
    setMeta({ title: d.title, categoryId: d.categoryId, tags: d.tags, minPlan: d.minPlan, visibility: d.visibility, activityTypes: d.activityTypes });
    setStatus(d.status);
    setDraft(d.draft);
    setRevision(d.revision);
    setAssets(d.assets);
    setFonts(d.fonts);
    setVariantId((v) => (d.draft.variants.some((x) => x.id === v) ? v : d.draft.variants[0]!.id));
    setSaveState('saved');
  }, [query.data]);

  const reload = useCallback(async () => {
    loadedRef.current = false;
    await qc.invalidateQueries({ queryKey: ['template', id] });
  }, [qc, id]);

  /** Mutate a deep copy of the draft. */
  const update = useCallback((fn: (d: TemplateDraft) => void) => {
    setDraft((cur) => {
      if (!cur) return cur;
      const next = clone(cur);
      fn(next);
      return next;
    });
    setSaveState((s) => (s === 'conflict' ? s : 'dirty'));
  }, []);

  // Autosave (debounced) with optimistic locking.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(() => {
    if (saveState !== 'dirty') return;
    const timer = setTimeout(async () => {
      const toSave = draftRef.current;
      if (!toSave) return;
      setSaveState('saving');
      try {
        const r = await api<{ revision: number; assets: Record<string, string>; fonts: Record<string, FontInfo> }>(`/templates/${id}/draft`, { method: 'PUT', body: { revision, draft: toSave } });
        setRevision(r.revision);
        setAssets((a) => ({ ...a, ...r.assets }));
        setFonts(r.fonts);
        setSaveState((s) => (s === 'saving' && draftRef.current === toSave ? 'saved' : 'dirty'));
      } catch (e) {
        setSaveState(e instanceof ApiError && e.status === 409 ? 'conflict' : 'error');
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [saveState, draft, id, revision]);

  const variant = draft?.variants.find((v) => v.id === variantId) ?? draft?.variants[0];
  const doc = variant?.document;
  const layers = useMemo(() => (doc ? [...walkLayers(doc.layers)] : []), [doc]);
  const selected = layers.find((l) => l.id === selectedId) ?? null;

  const updateDoc = useCallback(
    (fn: (doc: TemplateDocument, all: TemplateDraft) => void) =>
      update((d) => {
        const v = d.variants.find((x) => x.id === variantId) ?? d.variants[0]!;
        fn(v.document, d);
      }),
    [update, variantId],
  );

  const updateLayer = useCallback(
    (layerId: string, patch: Partial<Layer> | ((l: Layer) => void)) =>
      updateDoc((doc) => {
        for (const l of walkLayers(doc.layers)) {
          if (l.id !== layerId) continue;
          if (typeof patch === 'function') patch(l);
          else Object.assign(l, patch);
        }
      }),
    [updateDoc],
  );

  /** Change a field's shared definition in every variant that has it. */
  const updateField = useCallback(
    (key: string, patch: Partial<Field>, opts: { bindingsHere?: Field['bindings'] } = {}) =>
      update((d) => {
        for (const v of d.variants) {
          const f = v.document.fields.find((x) => x.key === key);
          if (!f) continue;
          for (const p of SHARED_FIELD_PROPS) if (p in patch) (f as Record<string, unknown>)[p] = patch[p as keyof Field];
          if (patch.key && patch.key !== key) f.key = patch.key;
          if (opts.bindingsHere && v.id === variantId) f.bindings = opts.bindingsHere;
        }
      }),
    [update, variantId],
  );

  const addAssetUrls = useCallback((more: Record<string, string>) => setAssets((a) => ({ ...a, ...more })), []);
  const addFonts = useCallback((more: Record<string, FontInfo>) => setFonts((f) => ({ ...f, ...more })), []);

  return {
    query,
    id,
    meta,
    setMeta,
    status,
    setStatus,
    draft,
    setDraft,
    revision,
    setRevision,
    variant,
    variantId: variant?.id ?? variantId,
    setVariantId,
    doc,
    layers,
    selected,
    selectedId,
    setSelectedId,
    values,
    setValues,
    assets,
    addAssetUrls,
    setAssets,
    fonts,
    addFonts,
    saveState,
    setSaveState,
    saveStateRef,
    revisionRef,
    update,
    updateDoc,
    updateLayer,
    updateField,
    reload,
  };
}

export type Editor = ReturnType<typeof useEditor>;
