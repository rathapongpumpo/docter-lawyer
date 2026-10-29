'use client';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { trackPath } from '@/lib/client/chat-return';

/** Renders nothing; keeps "back to chat" informed of where the reader came from. */
export function ChatReturnTracker() {
  const pathname = usePathname();
  useEffect(() => { trackPath(pathname); }, [pathname]);
  return null;
}
