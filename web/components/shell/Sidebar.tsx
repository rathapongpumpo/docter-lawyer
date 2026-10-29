'use client';
import { BarChart3, Bookmark, BookOpen, BookOpenCheck, ClipboardCheck, FileSearch, FileText, History, MessageSquare, Plus, Scale, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LogoMark } from '@/components/brand/Logo';
import { authClient } from '@/lib/auth-client';
import { useShell } from './shell-context';
import { detachNewChat } from '@/lib/client/chat-store';
import { ChatList } from './ChatList';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

const NAV = [
  { href: '/chat', key: 'chat', Icon: MessageSquare },
  { href: '/library', key: 'library', Icon: BookOpen },
  { href: '/templates', key: 'templates', Icon: FileText },
  { href: '/saved', key: 'saved', Icon: Bookmark },
  { href: '/admin', key: 'backoffice', Icon: ClipboardCheck, staff: true },
] as const;
const STAFF = new Set(['editor', 'reviewer', 'admin']);
// Organization menu (M11): who sees what — managers get usage and audit, everyone can reach counsel matters
const ORG_NAV = [
  { href: '/org/settings', key: 'orgSettings', Icon: Settings2, managers: false },
  { href: '/contracts', key: 'orgContracts', Icon: FileSearch, managers: false },
  { href: '/org/counsel', key: 'orgCounsel', Icon: Scale, managers: false },
  { href: '/org/usage', key: 'orgUsage', Icon: BarChart3, managers: true },
  { href: '/org/audit', key: 'orgAudit', Icon: History, managers: true },
] as const;

export function Sidebar({
  mobileOpen,
  desktopCollapsed,
  onNavigate,
}: {
  mobileOpen: boolean;
  desktopCollapsed: boolean;
  onNavigate: () => void;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useShell();
  const { data: activeOrg } = authClient.useActiveOrganization();
  // role of the current user in the active organization (taken from its member list — no extra request when there is none)
  const myRole = activeOrg?.members.find((m: { userId: string; role: string }) => m.userId === user.id)?.role;
  const isManager = myRole === 'org_owner' || myRole === 'org_admin';
  return (
    <aside
      className={`${mobileOpen ? 'flex' : 'hidden'} ${desktopCollapsed ? 'md:hidden' : 'md:flex'} bg-page fixed inset-y-0 left-0 z-40 w-[var(--sidebar-width)] flex-col gap-2 p-3 pt-2 md:static md:z-auto md:bg-none`}
    >
      <div className="flex h-12 shrink-0 items-center gap-3 px-2">
        <LogoMark size={44} />
        <span className="font-serif text-2xl leading-normal font-bold text-navy dark:text-text">{t('app.name')}</span>
      </div>
    <nav
      aria-label={t('nav.mainMenu')}
      className="on-navy flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-color:rgba(255,255,255,0.3)_transparent] [scrollbar-width:thin] rounded-3xl border border-white/10 shadow-[0_12px_32px_-12px_rgba(10,26,48,0.55)]"
    >
      <WorkspaceSwitcher />

      <div className="px-4 pt-3 pb-2">
        <Link
          href="/chat?new=1"
          // a fresh timestamp makes the page start a new view even when the current chat is also at /chat?new=1
          onClick={(e) => { e.preventDefault(); detachNewChat(); router.push(`/chat?new=1&t=${Date.now()}`); onNavigate(); }}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-gold-light to-gold text-[0.9375rem] font-semibold text-navy shadow-sm hover:from-gold hover:to-gold-600"
        >
          <Plus className="size-[18px]" aria-hidden="true" />
          {t('nav.newChat')}
        </Link>
      </div>

      <div className="flex flex-col gap-0.5 px-4 pt-2">
        <span className="px-3 py-1.5 text-xs font-semibold tracking-wide text-muted">{t('nav.mainMenu')}</span>
        {NAV.filter((n) => !('staff' in n) || STAFF.has(user.role)).map(({ href, key, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`) || (href === '/library' && pathname.startsWith('/law/'));
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={`flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm ${
                active ? 'border border-white/20 bg-primary-050 font-semibold text-primary-700' : 'border border-transparent text-text hover:bg-surface-2'
              }`}
            >
              <Icon className="size-[18px]" aria-hidden="true" />
              {t(`nav.${key}`)}
            </Link>
          );
        })}
      </div>

      {activeOrg && (
        <div className="flex flex-col gap-0.5 px-4 pt-3">
          <span className="px-3 py-1.5 text-xs font-semibold tracking-wide text-muted">{t('nav.orgMenu')}</span>
          {ORG_NAV.filter((n) => !n.managers || isManager).map(({ href, key, Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} href={href} onClick={onNavigate} aria-current={active ? 'page' : undefined}
                className={`flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm ${active ? 'border border-white/20 bg-primary-050 font-semibold text-primary-700' : 'border border-transparent text-text hover:bg-surface-2'}`}>
                <Icon className="size-[18px]" aria-hidden="true" />
                {t(`nav.${key}`)}
              </Link>
            );
          })}
        </div>
      )}

      <div className="mx-4 mt-3 border-t border-border" />

      <ChatList onNavigate={onNavigate} />
      {user.isGuest && (
        <Link href="/register" className="mx-4 mb-3 rounded-lg border border-border-strong px-3 py-2 text-center text-[0.8125rem] text-primary-700 hover:bg-primary-050">
          {t('header.register')}
        </Link>
      )}
      {/* pinned at the very bottom for every signed-in role, guests included; sticks while the menu scrolls */}
      <div className="sticky bottom-0 mt-auto shrink-0 border-t border-border bg-navy px-4 py-2">
        <Link
          href="/manual"
          onClick={onNavigate}
          aria-current={pathname.startsWith('/manual') ? 'page' : undefined}
          className={`flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm ${
            pathname.startsWith('/manual') ? 'border border-white/20 bg-primary-050 font-semibold text-primary-700' : 'border border-transparent text-text hover:bg-surface-2'
          }`}
        >
          <BookOpenCheck className="size-[18px]" aria-hidden="true" />
          {t('nav.manual')}
        </Link>
      </div>
    </nav>
    </aside>
  );
}
