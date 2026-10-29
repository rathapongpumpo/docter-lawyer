import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ContractsView } from '@/components/contracts/ContractsView';
import { env } from '@/lib/env';
import { orgPageContext, ORG_MANAGERS } from '@/lib/org-page';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('contracts'))('title') };
}

export default async function ContractsPage() {
  const { role } = await orgPageContext();
  return <ContractsView maxMb={env.contractMaxMb} maxPages={env.contractMaxPages} canRemoveAny={ORG_MANAGERS.includes(role)} />;
}
