'use client';
import type { ReactNode } from 'react';

// Layout pieces shared by the back-office pages.
export function AdminPage({ title, intro, actions, children }: { title: string; intro?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-2xl font-bold">{title}</h1>
            {intro && <p className="mt-1 max-w-[75ch] text-sm text-muted">{intro}</p>}
          </div>
          {actions}
        </div>
        {children}
      </div>
    </div>
  );
}
export const tableWrap = 'overflow-x-auto rounded-xl border border-border bg-surface';
export const th = 'px-3 py-2.5 text-left text-xs font-semibold text-muted';
export const td = 'px-3 py-2.5 align-top';
export const selectClass = 'h-10 rounded-[10px] border border-border-strong bg-surface px-2 text-sm';
