'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { errorClass, primaryBtn, secondaryBtn } from '@/components/account/styles';
import { authClient } from '@/lib/auth-client';
import { hardNavigate } from '@/lib/client/nav';

type Invitation = { id: string; email: string; role: string; status: string; organizationName: string; inviterEmail: string; expiresAt: string };

export function AcceptInvitation({ id }: { id: string }) {
  const t = useTranslations('org.invite');
  const roleT = useTranslations('org.roles');
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { data, isPending, isError } = useQuery({
    queryKey: ['invitation', id],
    retry: false,
    queryFn: async () => {
      const r = await authClient.organization.getInvitation({ query: { id } });
      if (r.error || !r.data) throw new Error(r.error?.code ?? 'ERROR');
      return r.data as unknown as Invitation;
    },
  });

  async function accept() {
    setPending(true);
    setError(null);
    const r = await authClient.organization.acceptInvitation({ invitationId: id });
    if (r.error) {
      setPending(false);
      return setError(r.error.code === 'EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION' ? t('verifyFirst') : t('acceptFailed'));
    }
    const orgId = (r.data as { member?: { organizationId?: string } } | null)?.member?.organizationId;
    if (orgId) await authClient.organization.setActive({ organizationId: orgId });
    await qc.invalidateQueries();
    hardNavigate('/chat');
  }
  async function reject() {
    setPending(true);
    await authClient.organization.rejectInvitation({ invitationId: id });
    hardNavigate('/chat');
  }

  return (
    <div className="flex w-full max-w-[460px] flex-col gap-5 rounded-2xl border border-border bg-surface p-8 shadow-lg">
      <h2 className="font-serif text-2xl font-bold">{t('title')}</h2>
      {isPending && <p className="text-muted">…</p>}
      {isError && (
        <>
          <p role="alert" className={errorClass}>{t('invalid')}</p>
          <Link href="/chat" className={secondaryBtn}>{t('back')}</Link>
        </>
      )}
      {data && (
        <>
          <p className="leading-relaxed">{t('body', { org: data.organizationName, role: roleT(data.role as never) })}</p>
          {data.status !== 'pending' && <p role="alert" className={errorClass}>{t('notPending')}</p>}
          {error && <p role="alert" className={errorClass}>{error}</p>}
          {data.status === 'pending' && (
            <div className="flex flex-col gap-2">
              <button type="button" disabled={pending} onClick={accept} className={primaryBtn}>{t('accept')}</button>
              <button type="button" disabled={pending} onClick={reject} className={secondaryBtn}>{t('reject')}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
