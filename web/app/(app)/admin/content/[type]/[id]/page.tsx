import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ContentEditor } from '@/components/admin/ContentEditor';
import { requireSection } from '@/lib/admin';
import { EDITABLE_TYPES } from '@/lib/content-edit';
import { getRefIndex } from '@/lib/kb';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.nav'))('content') };
}

export default async function Page({ params }: { params: Promise<{ type: string; id: string }> }) {
  await requireSection('content');
  const { type, id } = await params;
  if (!(EDITABLE_TYPES as readonly string[]).includes(type) || !/^\d+$/.test(id)) notFound();
  return <ContentEditor type={type as (typeof EDITABLE_TYPES)[number]} id={Number(id)} refs={await getRefIndex()} />;
}
