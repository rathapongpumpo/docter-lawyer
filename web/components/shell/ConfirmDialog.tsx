'use client';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, type ReactNode } from 'react';
import { useDismiss } from '@/lib/client/use-dismiss';

// A small modal for destructive choices (FR-CHAT-022/023). Escape or the backdrop cancels; focus starts on the safe button.
export function ConfirmDialog({ title, children, confirmLabel, danger = true, onConfirm, onCancel, extra }: {
  title: string; children?: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void; extra?: ReactNode;
}) {
  const t = useTranslations('common');
  const cancelRef = useRef<HTMLButtonElement>(null);
  useDismiss(onCancel); // declared first: it remembers the opener before focus moves to the safe button
  useEffect(() => { cancelRef.current?.focus(); }, []);
  return (
    <div role="alertdialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-surface p-5 shadow-lg">
        <h2 className="text-lg font-bold">{title}</h2>
        {children && <div className="text-sm text-muted">{children}</div>}
        <div className="flex flex-wrap justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className="h-10 rounded-[10px] border border-border-strong px-4 text-sm font-medium hover:bg-surface-2">{t('cancel')}</button>
          {extra}
          <button type="button" onClick={onConfirm} className={`h-10 rounded-[10px] px-4 text-sm font-semibold text-white ${danger ? 'bg-danger hover:opacity-90 dark:text-bg' : 'bg-primary hover:bg-primary-600'}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
