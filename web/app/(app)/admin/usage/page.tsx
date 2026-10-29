import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AdminUsage } from '@/components/admin/AdminUsage';
import { requireSection } from '@/lib/admin';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.nav'))('usage') };
}

export default async function Page() {
  await requireSection('usage');
  return <AdminUsage />;
}
