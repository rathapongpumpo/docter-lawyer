import { ArrowRight, Check, UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ManualDraftNotice, ManualFrame, ManualPending } from '@/components/manual/ManualFrame';
import { ManualSearch } from '@/components/manual/ManualSearch';
import { loadManual } from '@/lib/manual';
import { buildSearchIndex } from '@/lib/manual-core';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('manual'))('title') };
}

export default async function ManualPage() {
  const t = await getTranslations('manual');
  const manual = loadManual();
  return (
    <ManualFrame>
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-[1.75rem] leading-tight font-bold text-navy dark:text-text">{t('title')}</h1>
        <p className="max-w-[60ch] text-[1.0625rem] text-muted">{t('intro')}</p>
      </header>
      <ManualDraftNotice />
      {!manual ? (
        <ManualPending />
      ) : (
        <>
          <section aria-labelledby="manual-how" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h2 id="manual-how" className="font-serif text-xl font-bold">{t('howTitle')}</h2>
            <ol className="list-decimal space-y-1.5 pl-6 text-[1.0625rem] leading-relaxed">
              <li>{t('how1')}</li>
              <li>{t('how2')}</li>
              <li>{t('how3')}</li>
            </ol>
            <p className="text-sm text-muted">{t('version', { version: manual.version })}</p>
          </section>

          <section aria-labelledby="manual-search" className="flex flex-col gap-3">
            <h2 id="manual-search" className="font-serif text-xl font-bold">{t('searchTitle')}</h2>
            <ManualSearch index={buildSearchIndex(manual)} />
          </section>

          <section aria-labelledby="manual-roles" className="flex flex-col gap-4">
            <h2 id="manual-roles" className="font-serif text-xl font-bold">{t('rolesTitle')}</h2>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {manual.roles.map((r) => (
                <li key={r.id} className="relative flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 focus-within:border-primary hover:border-primary/50 hover:bg-surface-2">
                  <h3 className="flex items-center gap-2.5 font-serif text-lg leading-snug font-bold">
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-050 text-primary-700"><UserRound className="size-5" aria-hidden="true" /></span>
                    {/* stretched link: the whole card is clickable */}
                    <Link href={`/manual/${r.id}`} className="after:absolute after:inset-0 after:rounded-2xl">{r.title}</Link>
                  </h3>
                  <p className="leading-relaxed text-muted">{r.who}</p>
                  {r.can.length > 0 && (
                    <div className="text-sm">
                      <p className="font-semibold">{t('roleCardCan')}</p>
                      <ul className="mt-1 space-y-1">
                        {r.can.slice(0, 3).map((c, i) => (
                          <li key={i} className="flex gap-2"><Check className="mt-1 size-3.5 shrink-0 text-success" aria-hidden="true" /><span>{c}</span></li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <span className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-semibold text-primary-700" aria-hidden="true">
                    {t('openRole')} <ArrowRight className="size-4" />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </ManualFrame>
  );
}
