import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AdminUsers } from '@/components/admin/AdminUsers';
import { requireSection } from '@/lib/admin';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.nav'))('users') };
}

export default async function Page() {
  const { userId } = await requireSection('users');
  return <AdminUsers meId={userId} />;
}
