'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { login as apiLogin, logout as apiLogout, refreshSession, setSignedOutHandler, type AdminUser } from '@/lib/api';

interface AuthState {
  user: AdminUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside <Providers>');
  return ctx;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: false } } }));
  const [user, setUser] = useState<AdminUser | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setSignedOutHandler(() => {
      setUser(null);
      router.replace('/login');
    });
    refreshSession().then((u) => {
      setUser(u);
      setReady(true);
    });
  }, [router]);

  useEffect(() => {
    if (ready && !user && pathname !== '/login') router.replace('/login');
  }, [ready, user, pathname, router]);

  const login = useCallback(async (email: string, password: string) => {
    setUser(await apiLogin(email, password));
  }, []);
  const logout = useCallback(async () => {
    await apiLogout();
    queryClient.clear();
    setUser(null);
    router.replace('/login');
  }, [queryClient, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{ user, ready, login, logout }}>{children}</AuthContext.Provider>
    </QueryClientProvider>
  );
}

/** Renders children only for a signed-in admin. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready || !user) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-slate-400">
        <span className="size-6 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      </div>
    );
  }
  return <>{children}</>;
}
