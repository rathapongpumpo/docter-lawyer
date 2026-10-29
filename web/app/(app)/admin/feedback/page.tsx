import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AdminFeedback } from '@/components/admin/AdminFeedback';
import { requireSection } from '@/lib/admin';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.nav'))('feedback') };
}

export default async function Page() {
  await requireSection('feedback');
  return <AdminFeedback />;
}
