import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CreateOrgForm } from '@/components/shell/CreateOrgForm';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('workspace'))('createTitle') };
}

export default function NewOrgPage() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10">
      <CreateOrgForm />
    </div>
  );
}
