'use client';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

// Screenshot with a magnifier (+) badge; clicking opens it large in a native <dialog> (focus trap + Esc come for free),
// where the badge becomes a minus. Clicking the picture, the minus or the backdrop closes it again.
export function ZoomImage({ src, alt, width, height }: { src: string; alt: string; width: number; height: number }) {
  const t = useTranslations('manual');
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false); // the large <img> exists only while open, so closed dialogs load nothing
  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); dialog.current?.showModal(); }}
        aria-label={t('zoomIn')}
        className="group relative block w-full cursor-zoom-in overflow-hidden rounded-xl border border-border-strong bg-surface-2 p-0 shadow-md hover:shadow-lg"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} loading="lazy" decoding="async" width={width} height={height} className="block h-auto w-full" />
        <span aria-hidden className="absolute right-3 bottom-3 flex size-10 items-center justify-center rounded-full bg-navy/85 text-white shadow-lg group-hover:bg-navy print:hidden">
          <ZoomIn className="size-5" />
        </span>
      </button>
      <dialog
        ref={dialog}
        aria-label={alt}
        onClose={() => setOpen(false)}
        onClick={(e) => { if (e.target === e.currentTarget) dialog.current?.close(); }}
        className="m-auto max-h-[96vh] max-w-[96vw] overflow-auto rounded-xl border-0 bg-transparent p-0 backdrop:bg-black/80"
      >
        {open && (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            width={width}
            height={height}
            onClick={() => dialog.current?.close()}
            className="block h-auto max-h-[96vh] w-auto max-w-[96vw] cursor-zoom-out rounded-xl bg-surface"
          />
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label={t('zoomOut')}
            className="absolute right-3 bottom-3 flex size-11 cursor-zoom-out items-center justify-center rounded-full bg-navy/90 text-white shadow-lg hover:bg-navy"
          >
            <ZoomOut className="size-6" aria-hidden />
          </button>
        </div>
        )}
      </dialog>
    </>
  );
}
