import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { UsageView } from '@/components/org/UsageView';
import { orgPageContext, ORG_MANAGERS } from '@/lib/org-page';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('org.usage'))('title') };
}

export default async function OrgUsagePage() {
  const { orgId } = await orgPageContext(ORG_MANAGERS);
  return <UsageView orgId={orgId} />;
}
