import { AlertTriangle, BookA, BookOpen, FileText, ListChecks, MessageSquare, Scale } from 'lucide-react';
import { headers } from 'next/headers';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Markdown } from '@/components/chat/Markdown';
import { BackToChatLink } from '@/components/kb/BackToChatLink';
import { Breadcrumbs, type Crumb } from '@/components/kb/KbIndex';
import { SaveButton } from '@/components/kb/SaveButton';
import { roleOf } from '@/lib/api/handler';
import { auth } from '@/lib/auth';
import { expandRefs } from '@/lib/kb-refs';
import { getRefIndex, type KbStatus } from '@/lib/kb';
import { getGlossaryTips, isBookmarked } from '@/lib/kb-library';

const ICONS = { article: BookOpen, guide: ListChecks, template: FileText, law: Scale, glossary: BookA } as const;

export async function DraftNotice({ status }: { status: KbStatus }) {
  if (status === 'published') return null;
  const t = await getTranslations('kb');
  return (
    <div role="note" className="flex gap-2.5 rounded-xl border border-warning/40 bg-warning-050 p-3.5 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <div>
        <p className="font-semibold">{t('draftBadge')}</p>
        <p className="text-muted">{t('draftNotice')}</p>
      </div>
    </div>
  );
}

/** Page frame shared by /law, /library/articles, /guides and /templates. */
export async function KbFrame({
  kind,
  title,
  subtitle,
  status,
  askQuestion,
  crumbs,
  save,
  updatedAt,
  children,
}: {
  kind: keyof typeof ICONS;
  title: string;
  subtitle?: ReactNode;
  status: KbStatus;
  askQuestion: string;
  crumbs?: Crumb[];
  save?: { type: string; id: string; title: string };
  updatedAt?: string;
  children: ReactNode;
}) {
  const [t, locale] = await Promise.all([getTranslations('kb'), getLocale()]);
  const Icon = ICONS[kind];
  const session = save ? await auth.api.getSession({ headers: await headers() }) : null;
  const canSave = !!save && !!session && roleOf(session) !== 'guest';
  const saved = canSave ? await isBookmarked(Number(session!.user.id), save!.type, save!.id) : false;
  const updated = updatedAt
    ? new Date(updatedAt).toLocaleDateString(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' })
    : null;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
        {crumbs && <Breadcrumbs items={crumbs} label={t('breadcrumb')} />}
        <header className="flex flex-col gap-2">
          <span className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-primary-700">
            <Icon className="size-4" aria-hidden="true" />
            {t('type', { kind })}
          </span>
          <h1 className="font-serif text-2xl leading-snug font-bold text-navy sm:text-[1.75rem] dark:text-text">{title}</h1>
          {subtitle && <div className="max-w-[65ch] text-muted">{subtitle}</div>}
          {updated && <p className="text-xs text-muted">{t('updated', { date: updated })}</p>}
          {locale !== 'th' && <p className="text-sm text-muted">{t('thaiOnly')}</p>}
        </header>
        <DraftNotice status={status} />
        {children}
        <footer className="flex flex-wrap gap-2 border-t border-border pt-4 print:hidden">
          <Link
            href={`/chat?q=${encodeURIComponent(askQuestion)}`}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-600"
          >
            <MessageSquare className="size-4" aria-hidden="true" />
            {t('askAbout')}
          </Link>
          {canSave && save && <SaveButton type={save.type} id={save.id} title={save.title} saved={saved} />}
          <BackToChatLink className="inline-flex h-10 items-center rounded-[10px] border border-border px-4 text-sm hover:bg-surface-2">
            {t('backToChat')}
          </BackToChatLink>
        </footer>
      </article>
    </div>
  );
}

/** Knowledge-base Markdown with [[law:…]] / [[guide:…]] references turned into in-app links. */
export async function KbMarkdown({ md, glossarySkip }: { md: string; glossarySkip?: string[] }) {
  const [t, refs, glossary] = await Promise.all([getTranslations('kb'), getRefIndex(), getGlossaryTips()]);
  const body = expandRefs(md.replace(/^\s*#\s[^\n]*\n+/, ''), {
    ...refs,
    section: (law, section, paragraph) =>
      t('sectionShort', { law, section }) + (paragraph ? ` ${t('paragraph', { n: String(paragraph) })}` : ''),
    guide: (title) => t('guideLink', { title }),
    template: (title) => t('templateLink', { title }),
  });
  return <Markdown text={body} glossary={glossary} glossarySkip={glossarySkip} />;
}

/** Same reference expansion for a fragment that is rendered by a client component (guide steps, field help). */
export async function expandKbMarkdown(): Promise<(text: string) => string> {
  const [t, refs] = await Promise.all([getTranslations('kb'), getRefIndex()]);
  return (text) =>
    expandRefs(text, {
      ...refs,
      section: (law, section, paragraph) => t('sectionShort', { law, section }) + (paragraph ? ` ${t('paragraph', { n: String(paragraph) })}` : ''),
      guide: (title) => t('guideLink', { title }),
      template: (title) => t('templateLink', { title }),
    });
}
