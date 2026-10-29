import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ContractDetail } from '@/components/contracts/ContractDetail';
import { env } from '@/lib/env';
import { orgPageContext, ORG_MANAGERS } from '@/lib/org-page';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('contracts'))('title') };
}

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { role } = await orgPageContext();
  return <ContractDetail id={(await params).id} adminCanDelete={ORG_MANAGERS.includes(role)} reviewMode={env.contractReviewMode} />;
}
