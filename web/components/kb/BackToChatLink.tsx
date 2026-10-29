'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';
import { readChatReturn } from '@/lib/client/chat-return';

/** "Back to chat": returns to the chat the reader came from (history back when it is one page away); else /chat. */
export function BackToChatLink({ className, children }: { className?: string; children: ReactNode }) {
  const router = useRouter();
  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // let "open in new tab" work on the plain /chat link
    const back = readChatReturn();
    if (!back) return;
    e.preventDefault();
    if (back.steps === 1) router.back();
    else router.push(`/chat/${back.id}`);
  }
  return <Link href="/chat" onClick={onClick} className={className}>{children}</Link>;
}
