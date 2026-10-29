import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AdminGuardrails } from '@/components/admin/AdminGuardrails';
import { requireSection } from '@/lib/admin';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.nav'))('guardrails') };
}

export default async function Page() {
  await requireSection('guardrails');
  return <AdminGuardrails />;
}
