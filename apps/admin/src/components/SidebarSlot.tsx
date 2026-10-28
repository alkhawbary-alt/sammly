'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** The template editor needs the full width (three panes): hide the app sidebar there. */
export function SidebarSlot({ children }: { children: ReactNode }) {
  const path = usePathname();
  if (/^\/templates\/[^/]+$/.test(path)) return null;
  return <>{children}</>;
}
