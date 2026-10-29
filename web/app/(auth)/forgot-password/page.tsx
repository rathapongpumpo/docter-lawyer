import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { env } from '@/lib/env';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth'))('forgotTitle') };
}

export default function ForgotPasswordPage() {
  if (!env.mailLive) notFound(); // the reset link could not be delivered
  return <ForgotPasswordForm />;
}
