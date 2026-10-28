import { describe, expect, it } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://unused';
const { signToken, verifyToken, sniffMime } = await import('../src');

describe('signed storage tokens', () => {
  const base = { k: 'uploads/psd/a.psd', m: 'PUT' as const, mime: 'image/png', max: 10 };

  it('round-trips a valid token', () => {
    const t = signToken({ ...base, e: Date.now() + 60_000 });
    expect(verifyToken(t)).toMatchObject(base);
  });

  it('rejects expired, tampered and malformed tokens', () => {
    expect(verifyToken(signToken({ ...base, e: Date.now() - 1 }))).toBeNull();
    const t = signToken({ ...base, e: Date.now() + 60_000 });
    const [body, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ ...base, k: 'assets/other.png', e: Date.now() + 60_000 })).toString('base64url');
    expect(verifyToken(`${forged}.${sig}`)).toBeNull();
    expect(verifyToken(`${body}.${sig!.slice(0, -2)}xx`)).toBeNull();
    expect(verifyToken('garbage')).toBeNull();
  });
});

describe('sniffMime', () => {
  it('detects types by magic bytes', () => {
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffMime(Buffer.from('8BPS\u0000\u0001'))).toBe('image/vnd.adobe.photoshop');
    expect(sniffMime(Buffer.from('wOF2rest'))).toBe('font/woff2');
    expect(sniffMime(Buffer.from([0, 1, 0, 0, 0, 0]))).toBe('font/ttf');
    expect(sniffMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('image/svg+xml');
    expect(sniffMime(Buffer.from('<html><script>'))).toBeNull();
  });
});
