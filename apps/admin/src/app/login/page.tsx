'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/Providers';
import { Button, ErrorNote, FieldRow, Input } from '@/components/ui';
import { LocaleToggle } from '@/components/LocaleToggle';

export default function LoginPage() {
  const t = useTranslations('login');
  const { login, user, ready } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (ready && user) router.replace('/');
  }, [ready, user, router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.replace('/');
    } catch {
      setError(new Error(t('invalid')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-lg">
        <div className="text-center">
          <div className="text-3xl font-bold text-brand-600">صمملي</div>
          <div className="mt-1 text-sm text-slate-500">{t('subtitle')}</div>
        </div>
        <FieldRow label={t('email')}>
          <Input type="email" dir="ltr" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </FieldRow>
        <FieldRow label={t('password')}>
          <Input type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </FieldRow>
        <ErrorNote error={error} />
        <Button type="submit" className="w-full" busy={busy}>
          {t('submit')}
        </Button>
        <div className="border-t border-slate-100 pt-2">
          <LocaleToggle />
        </div>
      </form>
    </div>
  );
}
