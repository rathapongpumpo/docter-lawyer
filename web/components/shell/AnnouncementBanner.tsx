'use client';
import { Megaphone, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';

const noop = () => () => {};
const KEY = (id: string) => `lc_ann_${id}`;

// System announcement (FR-ADM-022). A member can close it; it stays closed for that message only (each new message has a new id).
export function AnnouncementBanner({ id, text, level }: { id: string; text: string; level: 'info' | 'warning' }) {
  const t = useTranslations('banners');
  const [closed, setClosed] = useState(false);
  const stored = useSyncExternalStore(noop, () => { try { return localStorage.getItem(KEY(id)) === '1'; } catch { return false; } }, () => true);
  if (stored || closed) return null;
  return (
    <div role="status" className={`flex items-center gap-3 px-4 py-2 text-sm ${level === 'warning' ? 'bg-warning-050 text-warning' : 'bg-primary-050 text-primary-700'}`}>
      <Megaphone className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{text}</span>
      <button type="button" aria-label={t('dismiss')} onClick={() => { setClosed(true); try { localStorage.setItem(KEY(id), '1'); } catch { /* storage may be blocked */ } }} className="flex size-7 items-center justify-center rounded-md hover:bg-black/5"><X className="size-4" aria-hidden="true" /></button>
    </div>
  );
}
