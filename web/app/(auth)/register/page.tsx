import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { AuthForm } from '@/components/auth/AuthForm';
import { env } from '@/lib/env';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth'))('registerTab') };
}

export default function RegisterPage() {
  return (
    <Suspense>
      <AuthForm mode="register" guestLimit={env.guestDailyMessages} />
    </Suspense>
  );
}
