import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AdminDsr } from '@/components/admin/AdminDsr';
import { requireSection } from '@/lib/admin';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.nav'))('dsr') };
}

export default async function Page() {
  await requireSection('dsr');
  return <AdminDsr />;
}
