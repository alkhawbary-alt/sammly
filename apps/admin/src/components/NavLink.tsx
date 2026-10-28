'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const path = usePathname();
  const active = href === '/' ? path === '/' : path.startsWith(href);
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${active ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-700 hover:bg-slate-50 hover:text-brand-700'}`}
    >
      {children}
    </Link>
  );
}
