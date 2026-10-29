import { ChevronDown } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { RoleMenu } from '@/lib/manual-core';

function TocList({ menus }: { menus: RoleMenu[] }) {
  return (
    <ul className="flex flex-col gap-3 text-[0.9375rem]">
      {menus.map((m) => (
        <li key={m.anchor}>
          <a href={`#${m.anchor}`} className="font-semibold text-text hover:underline">{m.title}</a>
          {m.tasks.length > 0 && (
            <ul className="mt-1 flex flex-col gap-1 border-l border-border pl-3">
              {m.tasks.map((t) => (
                <li key={t.anchor}><a href={`#${t.anchor}`} className="text-muted hover:text-text hover:underline">{t.task.title}</a></li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Table of contents: collapsible on small screens, sticky side column from lg up. Hidden when printing. */
export async function RoleToc({ menus }: { menus: RoleMenu[] }) {
  const t = await getTranslations('manual');
  return (
    <>
      <nav aria-label={t('tocTitle')} className="lg:hidden print:hidden">
        <details className="group rounded-xl border border-border bg-surface">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
            {t('tocTitle')}
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="border-t border-border px-4 py-3"><TocList menus={menus} /></div>
        </details>
      </nav>
      <nav aria-label={t('tocTitle')} className="sticky top-6 hidden max-h-[calc(100vh-6rem)] self-start overflow-y-auto rounded-xl border border-border bg-surface p-4 lg:block print:hidden">
        <p className="mb-3 text-sm font-semibold text-muted">{t('tocTitle')}</p>
        <TocList menus={menus} />
      </nav>
    </>
  );
}
