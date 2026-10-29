import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AdminSystem } from '@/components/admin/AdminSystem';
import { requireSection } from '@/lib/admin';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.nav'))('system') };
}

export default async function Page() {
  await requireSection('system');
  return <AdminSystem />;
}
