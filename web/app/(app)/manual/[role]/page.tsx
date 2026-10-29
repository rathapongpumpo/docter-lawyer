import { Check, X } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Breadcrumbs } from '@/components/kb/KbIndex';
import { ManualDraftNotice, ManualFrame, ManualPending } from '@/components/manual/ManualFrame';
import { PrintPageButton } from '@/components/manual/PrintPageButton';
import { RoleToc } from '@/components/manual/RoleToc';
import { TaskSection } from '@/components/manual/TaskSection';
import { loadManual } from '@/lib/manual';
import { isRoleId, resolveRoleMenus, ROLE_IDS, roleNeighbors } from '@/lib/manual-core';

type Props = { params: Promise<{ role: string }> };

export function generateStaticParams() {
  return ROLE_IDS.map((role) => ({ role }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ role }, t] = await Promise.all([params, getTranslations('manual')]);
  const found = isRoleId(role) ? loadManual()?.roles.find((r) => r.id === role) : undefined;
  return { title: found ? `${found.title} · ${t('title')}` : t('title') };
}

export default async function ManualRolePage({ params }: Props) {
  const { role: roleId } = await params;
  if (!isRoleId(roleId)) notFound();
  const t = await getTranslations('manual');
  const manual = loadManual();
  const role = manual?.roles.find((r) => r.id === roleId);
  const crumbs = [{ label: t('title'), href: '/manual' }, ...(role ? [{ label: role.title }] : [])];

  if (!manual || !role) {
    return (
      <ManualFrame>
        <Breadcrumbs items={crumbs} label={t('breadcrumb')} />
        <h1 className="font-serif text-[1.75rem] leading-tight font-bold text-navy dark:text-text">{t('title')}</h1>
        <ManualPending />
      </ManualFrame>
    );
  }

  const menus = resolveRoleMenus(manual, role);
  const { prev, next } = roleNeighbors(manual, role.id);
  return (
    <ManualFrame wide>
      <div className="print:hidden"><Breadcrumbs items={crumbs} label={t('breadcrumb')} /></div>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="font-serif text-[1.75rem] leading-tight font-bold text-navy dark:text-text">{role.title}</h1>
          <PrintPageButton />
        </div>
        <p className="text-[1.0625rem] leading-relaxed">{role.who}</p>
        <ManualDraftNotice />
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10 print:block">
        <RoleToc menus={menus} />
        <div className="flex max-w-[900px] min-w-0 flex-col gap-10">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <section aria-labelledby="role-can" className="rounded-2xl border border-border bg-surface p-5">
              <h2 id="role-can" className="mb-2 font-serif text-lg font-bold">{t('canTitle')}</h2>
              {role.can.length === 0 ? <p className="text-muted">{t('emptyList')}</p> : (
                <ul className="space-y-1.5">
                  {role.can.map((c, i) => (
                    <li key={i} className="flex gap-2 leading-relaxed"><Check className="mt-1.5 size-4 shrink-0 text-success" aria-hidden="true" /><span>{c}</span></li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="role-cannot" className="rounded-2xl border border-border bg-surface p-5">
              <h2 id="role-cannot" className="mb-2 font-serif text-lg font-bold">{t('cannotTitle')}</h2>
              {role.cannot.length === 0 ? <p className="text-muted">{t('emptyList')}</p> : (
                <ul className="space-y-1.5">
                  {role.cannot.map((c, i) => (
                    <li key={i} className="flex gap-2 leading-relaxed"><X className="mt-1.5 size-4 shrink-0 text-danger" aria-hidden="true" /><span>{c}</span></li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {menus.map((m) => (
            <section key={m.anchor} id={m.anchor} aria-labelledby={`${m.anchor}-h`} className="flex scroll-mt-6 flex-col gap-4">
              <div>
                <h2 id={`${m.anchor}-h`} className="font-serif text-2xl leading-snug font-bold text-navy dark:text-text">{m.title}</h2>
                {m.purpose && <p className="mt-1 text-[1.0625rem] leading-relaxed text-muted">{m.purpose}</p>}
              </div>
              {m.tasks.length === 0 ? <p className="text-muted">{t('emptyMenu')}</p> : m.tasks.map((item) => <TaskSection key={item.anchor} item={item} />)}
            </section>
          ))}

          <nav aria-label={t('roleNav')} className="flex flex-wrap items-stretch justify-between gap-3 border-t border-border pt-6 print:hidden">
            {prev ? (
              <Link href={`/manual/${prev.id}`} className="flex flex-col rounded-xl border border-border px-4 py-3 hover:bg-surface-2">
                <span className="text-xs text-muted">{t('prevRole')}</span>
                <span className="font-semibold">{prev.title}</span>
              </Link>
            ) : <span />}
            <Link href="/manual" className="self-center text-sm font-semibold text-primary-700 hover:underline">{t('allRoles')}</Link>
            {next ? (
              <Link href={`/manual/${next.id}`} className="flex flex-col rounded-xl border border-border px-4 py-3 text-right hover:bg-surface-2">
                <span className="text-xs text-muted">{t('nextRole')}</span>
                <span className="font-semibold">{next.title}</span>
              </Link>
            ) : <span />}
          </nav>
        </div>
      </div>
    </ManualFrame>
  );
}
