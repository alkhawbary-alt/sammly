import { getTranslations } from 'next-intl/server';
import {
  Bell,
  BookOpen,
  Bot,
  Building2,
  Coins,
  CreditCard,
  FolderTree,
  LayoutDashboard,
  LayoutTemplate,
  Megaphone,
  Package,
  Receipt,
  BarChart3,
  Settings,
  Shield,
  Smartphone,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { LocaleToggle } from './LocaleToggle';
import { NavLink } from './NavLink';
import { UserBox } from './UserBox';

interface NavItem {
  key: string;
  href: string;
  icon: LucideIcon;
  /** Pages flip to true as their milestone lands (M3–M6); others stay "coming soon". */
  enabled: boolean;
}

const NAV: NavItem[] = [
  { key: 'dashboard', href: '/', icon: LayoutDashboard, enabled: true },
  { key: 'templates', href: '/templates', icon: LayoutTemplate, enabled: true },
  { key: 'categories', href: '/categories', icon: FolderTree, enabled: true },
  { key: 'fonts', href: '/fonts', icon: Type, enabled: true },
  { key: 'businesses', href: '/businesses', icon: Building2, enabled: false },
  { key: 'plans', href: '/plans', icon: Package, enabled: false },
  { key: 'subscriptions', href: '/subscriptions', icon: Receipt, enabled: false },
  { key: 'credits', href: '/credits', icon: Coins, enabled: false },
  { key: 'simulator', href: '/simulator', icon: Smartphone, enabled: false },
  { key: 'appAssistant', href: '#', icon: Bot, enabled: false },
  { key: 'marketingAssistant', href: '#', icon: Megaphone, enabled: false },
  { key: 'knowledgeBase', href: '#', icon: BookOpen, enabled: false },
  { key: 'payments', href: '#', icon: CreditCard, enabled: false },
  { key: 'notifications', href: '#', icon: Bell, enabled: false },
  { key: 'reports', href: '#', icon: BarChart3, enabled: false },
  { key: 'security', href: '#', icon: Shield, enabled: false },
  { key: 'settings', href: '#', icon: Settings, enabled: false },
];

export async function Sidebar() {
  const t = await getTranslations();
  return (
    <aside className="flex w-60 shrink-0 flex-col border-e border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="text-xl font-bold text-brand-600">{t('app.name')}</div>
        <div className="text-xs text-slate-500">{t('app.subtitle')}</div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {NAV.map(({ key, href, icon: Icon, enabled }) =>
          enabled ? (
            <NavLink key={key} href={href}>
              <Icon className="size-4" />
              <span>{t(`nav.${key}`)}</span>
            </NavLink>
          ) : (
            <div
              key={key}
              aria-disabled
              className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400"
            >
              <Icon className="size-4" />
              <span className="flex-1">{t(`nav.${key}`)}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">{t('app.soon')}</span>
            </div>
          ),
        )}
      </nav>
      <div className="space-y-1 border-t border-slate-200 p-3">
        <UserBox />
        <LocaleToggle />
      </div>
    </aside>
  );
}
