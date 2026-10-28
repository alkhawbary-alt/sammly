import type { Layer, TextLayer } from './layers';

/** Depth-first, paint order. */
export function* walkLayers(layers: readonly Layer[]): Generator<Layer> {
  for (const l of layers) {
    yield l;
    if (l.type === 'group') yield* walkLayers(l.children);
  }
}

export function findLayer(layers: readonly Layer[], id: string): Layer | undefined {
  for (const l of walkLayers(layers)) if (l.id === id) return l;
  return undefined;
}

export function textLayers(layers: readonly Layer[]): TextLayer[] {
  return [...walkLayers(layers)].filter((l): l is TextLayer => l.type === 'text');
}

/** Ids of library fonts used by text layers (including runs), in first-use order. */
export function usedFontIds(layers: readonly Layer[]): string[] {
  const ids = new Set<string>();
  for (const t of textLayers(layers)) {
    if (t.style.fontId) ids.add(t.style.fontId);
    for (const r of t.runs ?? []) if (r.style.fontId) ids.add(r.style.fontId);
  }
  return [...ids];
}

/** PSD/fallback font names of text layers that are not mapped to the font library. */
export function unmappedFonts(layers: readonly Layer[]): string[] {
  const names = new Set<string>();
  for (const t of textLayers(layers)) {
    if (!t.style.fontId) names.add(t.style.fontFamily);
    for (const r of t.runs ?? []) if (r.style.fontFamily && !r.style.fontId) names.add(r.style.fontFamily);
  }
  return [...names];
}
