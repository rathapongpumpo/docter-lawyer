import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SECTION_PATH, sectionsFor } from '@/lib/admin';
import { roleOf } from '@/lib/api/handler';
import { auth } from '@/lib/auth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.nav'))('home') };
}

// Landing page of the back-office: only the sections the role may open are listed (FR-ADM-001).
export default async function AdminHome() {
  const session = await auth.api.getSession({ headers: await headers() });
  const t = await getTranslations('admin.nav');
  const role = roleOf(session);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 sm:p-6">
        <h1 className="font-serif text-2xl font-bold">{t('home')}</h1>
        <p className="text-muted">{t('intro', { role: t(`roles.${role}` as never) })}</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {sectionsFor(role).map((s) => (
            <li key={s}>
              <Link href={SECTION_PATH[s]} className="flex h-full flex-col gap-1 rounded-xl border border-border bg-surface p-4 hover:border-primary/50">
                <span className="font-semibold">{t(s as never)}</span>
                <span className="text-sm text-muted">{t(`desc.${s}` as never)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
