'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';
import { useShell } from './shell-context';

const inputClass =
  'h-11 w-full rounded-[10px] border border-border-strong bg-surface px-3 text-[0.9375rem] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

const SLUG = /^[a-z0-9-]{3,40}$/;

export function CreateOrgForm() {
  const t = useTranslations('workspace');
  const tAuth = useTranslations('auth');
  const { user } = useShell();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (user.isGuest) return <p className="text-muted">{t('guestCannotCreate')}</p>;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const slug = String(form.get('slug')).trim().toLowerCase();
    if (!SLUG.test(slug)) {
      setPending(false);
      return setError(t('slugInvalid'));
    }
    const result = await authClient.organization.create({ name: String(form.get('name')).trim(), slug });
    if (result.error || !result.data) {
      setPending(false);
      return setError(result.error?.code === 'ORGANIZATION_SLUG_ALREADY_TAKEN' ? t('slugTaken') : tAuth('errorGeneric'));
    }
    await authClient.organization.setActive({ organizationId: result.data.id });
    await queryClient.invalidateQueries();
    router.replace('/chat');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <div>
        <h1 className="text-xl font-semibold">{t('createTitle')}</h1>
        <p className="mt-1 text-sm text-muted">{t('createHint')}</p>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t('nameLabel')}
        <input name="name" required maxLength={120} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t('slugLabel')}
        <input name="slug" required maxLength={40} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby="slug-hint" className={inputClass} />
        <span id="slug-hint" className="text-xs font-normal text-muted">{t('slugHint')}</span>
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-050 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => router.back()} className="h-10 rounded-[10px] border border-border-strong px-4 text-sm">
          {t('cancel')}
        </button>
        <button type="submit" disabled={pending} className="h-10 rounded-[10px] bg-primary px-5 text-sm font-semibold text-white disabled:opacity-60">
          {t('submit')}
        </button>
      </div>
    </form>
  );
}
