export interface CategoryRow {
  id: string;
  parentId: string | null;
  slug: string;
  name: { ar: string; en?: string };
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  templateCount: number;
}

export const localized = (v: { ar: string; en?: string } | null | undefined, locale: string) => (!v ? '' : locale === 'en' && v.en ? v.en : v.ar);
export const categoryName = (c: { name: { ar: string; en?: string } }, locale: string) => localized(c.name, locale);

/** Categories in tree order (each parent followed by its children) for dropdowns. */
export function categoryTree<T extends Pick<CategoryRow, 'id' | 'parentId' | 'sortOrder'>>(rows: T[]): T[] {
  const bySort = (a: T, b: T) => a.sortOrder - b.sortOrder;
  return rows
    .filter((r) => !r.parentId)
    .sort(bySort)
    .flatMap((p) => [p, ...rows.filter((c) => c.parentId === p.id).sort(bySort)]);
}

export interface FontRow {
  id: string;
  family: string;
  weight: number;
  style: string;
  aliases: string[];
  scripts: string[];
  license: string | null;
  url: string;
}
