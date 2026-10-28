'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui';

interface Stats {
  templates: number;
  published: number;
  drafts: number;
  businesses: number;
  designsToday: number;
  imports: number;
  fonts: number;
  creditsUsed: number;
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const { data } = useQuery({ queryKey: ['stats'], queryFn: () => api<Stats>('/dashboard/stats') });
  const tiles: { key: keyof Stats; href?: string }[] = [
    { key: 'templates', href: '/templates' },
    { key: 'published', href: '/templates' },
    { key: 'drafts', href: '/templates' },
    { key: 'fonts', href: '/fonts' },
    { key: 'imports' },
    { key: 'businesses' },
    { key: 'designsToday' },
    { key: 'creditsUsed' },
  ];
  return (
    <div className="p-8">
      <PageHeader title={t('title')} subtitle={t('welcome')} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(({ key, href }) => {
          const body = (
            <Card className="p-5 transition-shadow hover:shadow-sm">
              <div className="text-sm text-slate-500">{t(`stats.${key}`)}</div>
              <div className="mt-1 text-3xl font-bold tabular-nums">{data ? data[key] : '—'}</div>
            </Card>
          );
          return href ? (
            <Link key={key} href={href}>
              {body}
            </Link>
          ) : (
            <div key={key}>{body}</div>
          );
        })}
      </div>
    </div>
  );
}
