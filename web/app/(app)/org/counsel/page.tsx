import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CounselInbox } from '@/components/org/CounselInbox';
import { orgPageContext } from '@/lib/org-page';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('org.counsel'))('title') };
}

export default async function CounselPage({ searchParams }: { searchParams: Promise<{ box?: string }> }) {
  const { orgId, role } = await orgPageContext();
  const { box } = await searchParams;
  return <CounselInbox orgId={orgId} isCounsel={role === 'org_counsel'} initialBox={box === 'sent' ? 'sent' : 'inbox'} />;
}
