'use client';
import { Printer } from 'lucide-react';
import { useEffect } from 'react';

export function PrintButton({ auto, label }: { auto: boolean; label: string }) {
  useEffect(() => {
    if (auto) {
      const id = setTimeout(() => window.print(), 400);
      return () => clearTimeout(id);
    }
  }, [auto]);
  return (
    <button type="button" onClick={() => window.print()} className="mt-2 inline-flex h-10 items-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-semibold text-white">
      <Printer className="size-4" aria-hidden="true" />{label}
    </button>
  );
}
