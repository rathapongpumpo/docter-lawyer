import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AdminAudit } from '@/components/admin/AdminAudit';
import { requireSection } from '@/lib/admin';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.nav'))('audit') };
}

export default async function Page() {
  await requireSection('audit');
  return <AdminAudit />;
}
