import { getTranslations } from 'next-intl/server';

async function apiHealthy(): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  try {
    const res = await fetch(`${base}/ready`, { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function DashboardPage() {
  const t = await getTranslations('dashboard');
  const ok = await apiHealthy();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-slate-500">{t('welcome')}</p>
      </div>
      <section className="max-w-md rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">{t('status')}</h2>
        <div className="flex items-center justify-between text-sm">
          <span>{t('api')}</span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            }`}
          >
            {ok ? t('ok') : t('down')}
          </span>
        </div>
      </section>
    </div>
  );
}
