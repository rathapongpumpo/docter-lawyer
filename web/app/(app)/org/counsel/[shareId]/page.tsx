import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CounselDetail } from '@/components/org/CounselDetail';
import { orgPageContext } from '@/lib/org-page';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('org.counsel'))('title') };
}

export default async function CounselDetailPage({ params }: { params: Promise<{ shareId: string }> }) {
  await orgPageContext();
  const { shareId } = await params;
  return <CounselDetail shareId={shareId} />;
}
