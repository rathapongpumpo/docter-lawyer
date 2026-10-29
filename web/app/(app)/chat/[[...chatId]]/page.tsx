import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ChatView } from '@/components/chat/ChatView';
import { getLastChatId } from '@/lib/account';
import { roleOf } from '@/lib/api/handler';
import { auth } from '@/lib/auth';
import { chatAccess } from '@/lib/chats';
import { listScopeCategories } from '@/lib/kb-categories';
import { activeOrgFor } from '@/lib/org';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('nav'))('chat') };
}

export default async function ChatPage({ params, searchParams }: PageProps<'/chat/[[...chatId]]'>) {
  const { chatId } = await params;
  const sp = await searchParams;
  // "ถามนิติมิตรเรื่องนี้" on knowledge pages links to /chat?q=… — the text is only a draft, never auto-sent (FR-CHAT-030 AC2)
  const initialDraft = typeof sp.q === 'string' ? sp.q.slice(0, 500) : '';
  let id = chatId?.[0] ?? null;
  if (chatId && (chatId.length > 1 || !UUID.test(id ?? ''))) notFound();

  const session = (await auth.api.getSession({ headers: await headers() }))!;
  const userId = Number(session.user.id);
  const member = roleOf(session) !== 'guest';
  const org = await activeOrgFor(userId, (session.session as { activeOrganizationId?: string | null }).activeOrganizationId);

  // /chat on its own reopens the last chat; "new chat" links to /chat?new=1 (FR-CHAT-030)
  if (!id && member && !initialDraft && !sp.new) {
    const last = await getLastChatId(userId, org?.orgId ?? null);
    if (last) redirect(`/chat/${last}`);
  }
  // a chat that is not the caller's (or gone) shows "not found" and a fresh chat instead
  let missing = false;
  if (id && !(await chatAccess(session, id))) { missing = true; id = null; }

  const locale = await getLocale();
  const categories = await listScopeCategories(locale);
  // key forces a fresh view when switching chats from the sidebar
  return <ChatView key={id ?? `new-${typeof sp.t === 'string' ? sp.t : ''}`} chatId={id} initialDraft={initialDraft} categories={categories} notFound={missing} />;
}
