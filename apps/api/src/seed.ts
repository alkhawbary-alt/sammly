/**
 * `pnpm db:seed` — idempotent. M2: the open-licensed font library from fixtures/fonts.
 * (Admin user, plans, categories, demo businesses and PSD templates are added in M3/M5/M7.)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { db, disconnectDb } from '@sammly/db';
import { createFont, REPO_ROOT } from '@sammly/platform';

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

await seedFonts();
await disconnectDb();
