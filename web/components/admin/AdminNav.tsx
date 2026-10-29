'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SECTION_PATH_CLIENT } from './sections';

// Tabs of the back-office, limited to the sections the signed-in role may open (FR-ADM-001).
export function AdminNav({ sections }: { sections: string[] }) {
  const t = useTranslations('admin.nav');
  const pathname = usePathname();
  return (
    <nav aria-label={t('label')} className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-surface px-3 py-2">
      <Link href="/admin" aria-current={pathname === '/admin' ? 'page' : undefined} className={`rounded-lg px-3 py-1.5 text-sm whitespace-nowrap ${pathname === '/admin' ? 'bg-primary-050 font-semibold text-primary-700' : 'text-muted hover:bg-surface-2'}`}>{t('home')}</Link>
      {sections.map((s) => {
        const href = SECTION_PATH_CLIENT[s]!;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={s} href={href} aria-current={active ? 'page' : undefined} className={`rounded-lg px-3 py-1.5 text-sm whitespace-nowrap ${active ? 'bg-primary-050 font-semibold text-primary-700' : 'text-muted hover:bg-surface-2'}`}>
            {t(s as never)}
          </Link>
        );
      })}
    </nav>
  );
}
