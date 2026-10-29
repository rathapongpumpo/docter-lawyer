import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuditView } from '@/components/org/AuditView';
import { orgPageContext, ORG_MANAGERS } from '@/lib/org-page';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('org.audit'))('title') };
}

export default async function OrgAuditPage() {
  const { orgId } = await orgPageContext(ORG_MANAGERS);
  return <AuditView orgId={orgId} />;
}
