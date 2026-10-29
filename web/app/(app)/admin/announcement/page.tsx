import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AdminAnnouncement } from '@/components/admin/AdminAnnouncement';
import { requireSection } from '@/lib/admin';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.nav'))('announcement') };
}

export default async function Page() {
  await requireSection('announcement');
  return <AdminAnnouncement />;
}
