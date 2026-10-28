/**
 * `pnpm db:seed` — idempotent. Font library, admin user, plans and category tree.
 * (Demo businesses and PSD templates are added in M5/M7.)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import argon2 from 'argon2';
import { db, disconnectDb, type PlanCode } from '@sammly/db';
import { createFont, REPO_ROOT } from '@sammly/platform';
import { DEFAULT_PLAN_FEATURES } from '@sammly/shared';

interface LibFont { id: string; family: string; weight: number; style: 'normal' | 'italic'; file: string; aliases: string[]; scripts: string[]; license: string }

async function seedFonts() {
  const dir = path.join(REPO_ROOT, 'fixtures/fonts');
  const lib: LibFont[] = JSON.parse(await fs.readFile(path.join(dir, 'library.json'), 'utf8')).fonts;
  let created = 0;
  for (const f of lib) {
    const exists = await db().font.findFirst({ where: { family: f.family, weight: f.weight, style: f.style, deletedAt: null } });
    if (exists) continue;
    await createFont({ body: await fs.readFile(path.join(dir, f.file)), family: f.family, weight: f.weight, style: f.style, aliases: f.aliases, scripts: f.scripts, license: f.license });
    created++;
  }
  console.log(`fonts: ${created} created, ${lib.length - created} already present`);
}

async function seedAdmin() {
  const email = (process.env.ADMIN_SEED_EMAIL ?? 'admin@sammly.local').toLowerCase();
  const password = process.env.ADMIN_SEED_PASSWORD ?? 'Sammly-Demo-2026';
  if (await db().adminUser.findUnique({ where: { email } })) return console.log(`admin: ${email} already present`);
  await db().adminUser.create({ data: { email, name: 'مدير صمملي', role: 'SUPER_ADMIN', passwordHash: await argon2.hash(password) } });
  console.log(`admin: created ${email} (password from ADMIN_SEED_PASSWORD)`);
}

const PLANS: { code: PlanCode; name: { ar: string; en: string }; monthlyAiCredits: number }[] = [
  { code: 'BASIC', name: { ar: 'الأساسية', en: 'Basic' }, monthlyAiCredits: 10 },
  { code: 'BUSINESS', name: { ar: 'الأعمال', en: 'Business' }, monthlyAiCredits: 100 },
  { code: 'PRO', name: { ar: 'الاحترافية', en: 'Pro' }, monthlyAiCredits: 500 },
];

async function seedPlans() {
  for (const p of PLANS) {
    await db().plan.upsert({ where: { code: p.code }, update: {}, create: { ...p, features: DEFAULT_PLAN_FEATURES[p.code] } });
  }
  console.log(`plans: ${PLANS.length} ensured`);
}

const CATEGORIES: { slug: string; ar: string; en: string; icon: string; children: [string, string, string][] }[] = [
  { slug: 'congratulations', ar: 'تهاني', en: 'Congratulations', icon: 'party-popper', children: [['wedding', 'زواج', 'Wedding'], ['engagement', 'خطوبة', 'Engagement'], ['newborn', 'مولود', 'Newborn'], ['graduation', 'تخرج', 'Graduation']] },
  { slug: 'occasions', ar: 'مناسبات', en: 'Occasions', icon: 'calendar-heart', children: [['friday', 'الجمعة', 'Friday'], ['ramadan', 'رمضان', 'Ramadan'], ['eid', 'الأعياد', 'Eids'], ['national-day', 'اليوم الوطني', 'National Day']] },
  { slug: 'products-offers', ar: 'منتجات وعروض', en: 'Products & offers', icon: 'tag', children: [['new-product', 'منتج جديد', 'New product'], ['discount', 'خصم', 'Discount'], ['special-offer', 'عرض خاص', 'Special offer'], ['quote', 'عرض سعر', 'Price quote']] },
  { slug: 'announcements', ar: 'إعلانات تشغيلية', en: 'Announcements', icon: 'megaphone', children: [['opening', 'افتتاح', 'Opening'], ['hours', 'دوام', 'Working hours'], ['holiday', 'إجازة', 'Holiday'], ['new-branch', 'فرع جديد', 'New branch']] },
  { slug: 'condolences', ar: 'تعازي', en: 'Condolences', icon: 'flower', children: [] },
];

async function seedCategories() {
  let n = 0;
  for (const [i, c] of CATEGORIES.entries()) {
    const parent = await db().category.upsert({ where: { slug: c.slug }, update: {}, create: { slug: c.slug, name: { ar: c.ar, en: c.en }, icon: c.icon, sortOrder: i } });
    n++;
    for (const [j, [slug, ar, en]] of c.children.entries()) {
      await db().category.upsert({ where: { slug }, update: {}, create: { slug, name: { ar, en }, parentId: parent.id, sortOrder: j } });
      n++;
    }
  }
  console.log(`categories: ${n} ensured`);
}

await seedFonts();
await seedAdmin();
await seedPlans();
await seedCategories();
await disconnectDb();
