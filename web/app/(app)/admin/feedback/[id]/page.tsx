import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AdminFeedbackDetail } from '@/components/admin/AdminFeedbackDetail';
import { requireSection } from '@/lib/admin';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.nav'))('feedback') };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('feedback');
  return <AdminFeedbackDetail id={(await params).id} />;
}
