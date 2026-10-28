'use client';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'TEMPLATE_EDITOR' | 'SUPPORT';
}

// Access token lives in memory only; the refresh token is an httpOnly cookie the API sets.
let accessToken: string | null = null;
let refreshing: Promise<AdminUser | null> | null = null;
let onSignedOut: (() => void) | null = null;

export function setSignedOutHandler(fn: () => void) {
  onSignedOut = fn;
}

async function parse(res: Response) {
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (json as { error?: { code: string; message: string; details?: unknown } }).error;
    throw new ApiError(res.status, e?.code ?? 'HTTP_ERROR', e?.message ?? res.statusText, e?.details);
  }
  return json;
}

/** Exchange the refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshSession(): Promise<AdminUser | null> {
  refreshing ??= fetch(`${API_URL}/api/v1/admin/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async (res) => {
      if (!res.ok) {
        accessToken = null;
        return null;
      }
      const body = (await res.json()) as { accessToken: string; user: AdminUser };
      accessToken = body.accessToken;
      return body.user;
    })
    .catch(() => null)
    .finally(() => (refreshing = null));
  return refreshing;
}

export async function login(email: string, password: string): Promise<AdminUser> {
  const res = await fetch(`${API_URL}/api/v1/admin/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = (await parse(res)) as { accessToken: string; user: AdminUser };
  accessToken = body.accessToken;
  return body.user;
}

export async function logout(): Promise<void> {
  await fetch(`${API_URL}/api/v1/admin/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
  accessToken = null;
}

/** JSON call to /api/v1/admin/*; refreshes once on 401. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const doFetch = () =>
    fetch(`${API_URL}/api/v1/admin${path}`, {
      method: init.method ?? 'GET',
      credentials: 'include',
      headers: {
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  let res = await doFetch();
  if (res.status === 401) {
    const user = await refreshSession();
    if (!user) {
      onSignedOut?.();
      throw new ApiError(401, 'UNAUTHORIZED', 'Session expired');
    }
    res = await doFetch();
  }
  return (await parse(res)) as T;
}

export type UploadKind = 'psd' | 'font' | 'image';

/** presign → PUT with progress → returns the storage key to hand to the consuming endpoint. */
export async function uploadFile(kind: UploadKind, file: File, onProgress?: (fraction: number) => void): Promise<string> {
  const mime = file.type || 'application/octet-stream';
  const p = await api<{ key: string; url: string; headers: Record<string, string> }>('/uploads/presign', {
    method: 'POST',
    body: { kind, mime, bytes: file.size, fileName: file.name },
  });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', p.url);
    for (const [k, v] of Object.entries(p.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new ApiError(xhr.status, 'UPLOAD_FAILED', xhr.responseText)));
    xhr.onerror = () => reject(new ApiError(0, 'UPLOAD_FAILED', 'Network error'));
    xhr.send(file);
  });
  return p.key;
}

export interface JobView {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  result: unknown;
  url: string | null;
  error: string | null;
  durationMs: number | null;
}

export async function waitForJob(jobId: string, onTick?: (j: JobView) => void, timeoutMs = 300_000): Promise<JobView> {
  const started = Date.now();
  for (;;) {
    const j = await api<JobView>(`/jobs/${jobId}`);
    onTick?.(j);
    if (j.status === 'SUCCEEDED' || j.status === 'FAILED') return j;
    if (Date.now() - started > timeoutMs) throw new ApiError(0, 'TIMEOUT', 'Job took too long');
    await new Promise((r) => setTimeout(r, 800));
  }
}
