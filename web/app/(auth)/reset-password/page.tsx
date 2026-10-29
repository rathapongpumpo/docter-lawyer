import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { env } from '@/lib/env';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth'))('resetTitle') };
}

export default function ResetPasswordPage() {
  if (!env.mailLive) notFound(); // no reset link can be delivered, so the page does not exist (same as /forgot-password)
  return (
    <Suspense>
      <ResetPasswordForm mailLive={env.mailLive} />
    </Suspense>
  );
}
