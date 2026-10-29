import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LawImport } from '@/components/admin/LawImport';
import { requireSection } from '@/lib/admin';
import { listLaws } from '@/lib/law-import';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.nav'))('laws') };
}

export default async function Page() {
  await requireSection('laws');
  return <LawImport laws={await listLaws()} />;
}
