'use client';

import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuth } from './Providers';

export function UserBox() {
  const t = useTranslations('common');
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-slate-700">{user.name}</div>
        <div className="truncate text-xs text-slate-400" dir="ltr">
          {user.email}
        </div>
      </div>
      <button type="button" onClick={logout} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title={t('logout')}>
        <LogOut className="size-4" />
      </button>
    </div>
  );
}
