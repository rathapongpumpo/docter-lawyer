'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/** A glossary term inside running text: dotted underline; hover, focus or tap shows the short definition. */
export function GlossaryTip({ slug, def, children }: { slug: string; def: string; children: ReactNode }) {
  const t = useTranslations('glossary');
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <span
      ref={root}
      className="relative inline"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(e) => { if (!root.current?.contains(e.relatedTarget as Node | null)) setOpen(false); }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        className="cursor-help border-b border-dotted border-primary-700 text-inherit"
      >
        {children}
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="fixed inset-x-4 bottom-4 z-30 flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-3 text-left text-sm leading-relaxed font-normal text-text shadow-lg sm:absolute sm:inset-x-auto sm:top-full sm:bottom-auto sm:left-1/2 sm:mt-1 sm:w-72 sm:-translate-x-1/2"
        >
          <span>{def}</span>
          <Link href={`/library/glossary/${slug}`} className="font-semibold text-primary-700 underline underline-offset-2">
            {t('readMore')}
          </Link>
        </span>
      )}
    </span>
  );
}
