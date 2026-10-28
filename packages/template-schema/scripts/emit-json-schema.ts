/** Writes dist/schema.json (JSON Schema of the Template Document) for the mobile team. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { TemplateDocument } from '../src';

const out = path.resolve(import.meta.dirname, '..', 'dist', 'schema.json');
const schema = z.toJSONSchema(TemplateDocument, { io: 'input', cycles: 'ref', unrepresentable: 'any' });
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, JSON.stringify({ title: 'Sammly Template Document v1', ...schema }, null, 2));
console.log(`wrote ${path.relative(process.cwd(), out)}`);
