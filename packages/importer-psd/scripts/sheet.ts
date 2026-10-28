/** Dev tool: test-output/qa/<name>/sheet.png = composite | render | diff, scaled to 600px tall. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const outRoot = path.join(import.meta.dirname, '..', 'test-output', 'qa');
for (const name of await fs.readdir(outRoot)) {
  const dir = path.join(outRoot, name);
  const parts = ['composite.png', 'render.png', 'diff.png'].map((f) => path.join(dir, f));
  if (!(await Promise.all(parts.map((p) => fs.stat(p).then(() => true, () => false)))).every(Boolean)) continue;
  const h = 600;
  const imgs = await Promise.all(parts.map((p) => sharp(p).flatten({ background: '#fff' }).resize({ height: h }).png().toBuffer({ resolveWithObject: true })));
  const width = imgs.reduce((s, i) => s + i.info.width + 10, 0);
  let x = 0;
  const composite = imgs.map((i) => {
    const o = { input: i.data, left: x, top: 0 };
    x += i.info.width + 10;
    return o;
  });
  await sharp({ create: { width, height: h, channels: 3, background: '#888' } }).composite(composite).png().toFile(path.join(dir, 'sheet.png'));
  console.log(`sheet: ${name}`);
}
