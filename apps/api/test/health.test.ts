import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';

describe('api health', () => {
  it('GET /health → ok', async () => {
    const app = buildApp({ checkDb: async () => true });
    const res = await app.inject('/health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /ready → 503 when the db is down', async () => {
    const app = buildApp({ checkDb: async () => false });
    const res = await app.inject('/ready');
    expect(res.statusCode).toBe(503);
    expect(res.json().checks.db).toBe(false);
  });

  it('unknown routes use the error envelope', async () => {
    const app = buildApp({ checkDb: async () => true });
    const res = await app.inject('/nope');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });
});
