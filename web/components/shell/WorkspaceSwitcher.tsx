'use client';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronsUpDown, Plus, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { useDismiss } from '@/lib/client/use-dismiss';
import { useShell } from './shell-context';

// M11: personal space vs organization workspaces (Better Auth organization plugin)
export function WorkspaceSwitcher() {
  const t = useTranslations('workspace');
  const { user } = useShell();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: orgs } = authClient.useListOrganizations();
  const { data: active } = authClient.useActiveOrganization();
  const [open, setOpen] = useState(false);
  useDismiss(() => setOpen(false), { active: open });

  async function select(organizationId: string | null) {
    setOpen(false);
    await authClient.organization.setActive({ organizationId });
    await queryClient.invalidateQueries();
    router.refresh();
  }

  const label = active?.name ?? t('personal');
  return (
    <div className="relative px-4 pt-3.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t('switch')}
        className="flex w-full items-center gap-2.5 rounded-[10px] border border-border bg-bg px-2.5 py-2 text-left"
      >
        <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-navy text-white">
          {active ? <Building2 className="size-4" aria-hidden="true" /> : <User className="size-4" aria-hidden="true" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[0.8125rem] font-semibold">{label}</span>
          <span className="text-xs text-muted">{active ? t('orgBadge') : t('label')}</span>
        </span>
        <ChevronsUpDown className="size-3.5 text-muted" aria-hidden="true" />
      </button>
      {open && (
        <div role="listbox" className="absolute right-4 left-4 z-50 mt-1 rounded-[10px] border border-border bg-surface p-1 shadow-lg">
          <button
            type="button"
            role="option"
            aria-selected={!active}
            onClick={() => select(null)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[0.8125rem] hover:bg-surface-2"
          >
            <User className="size-4 text-muted" aria-hidden="true" />
            {t('personal')}
          </button>
          {(orgs ?? []).map((org) => (
            <button
              key={org.id}
              type="button"
              role="option"
              aria-selected={active?.id === org.id}
              onClick={() => select(org.id)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[0.8125rem] hover:bg-surface-2"
            >
              <Building2 className="size-4 text-muted" aria-hidden="true" />
              <span className="truncate">{org.name}</span>
            </button>
          ))}
          <div className="my-1 border-t border-border" />
          {user.isGuest ? (
            <p className="px-2.5 py-2 text-[0.75rem] text-muted">{t('guestCannotCreate')}</p>
          ) : (
            <Link
              href="/org/new"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[0.8125rem] text-primary-700 hover:bg-primary-050"
            >
              <Plus className="size-4" aria-hidden="true" />
              {t('create')}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
