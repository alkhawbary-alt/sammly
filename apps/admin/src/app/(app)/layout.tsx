import type { ReactNode } from 'react';
import { AuthGate } from '@/components/Providers';
import { Sidebar } from '@/components/Sidebar';
import { SidebarSlot } from '@/components/SidebarSlot';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarSlot>
        <Sidebar />
      </SidebarSlot>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <AuthGate>{children}</AuthGate>
      </main>
    </div>
  );
}
