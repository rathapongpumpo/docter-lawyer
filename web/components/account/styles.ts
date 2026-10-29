// Shared form styling for auth and settings screens (all colours are tokens, work in light and dark).
export const inputClass =
  'h-11 w-full rounded-[10px] border border-border-strong bg-surface px-3 text-[0.9375rem] text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';
export const primaryBtn =
  'inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-primary px-5 text-[0.9375rem] font-semibold text-white hover:bg-primary-600 disabled:opacity-60';
export const secondaryBtn =
  'inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border border-border-strong bg-surface px-5 text-[0.9375rem] font-medium text-text hover:bg-surface-2 disabled:opacity-60';
export const dangerBtn =
  'inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-danger px-5 text-[0.9375rem] font-semibold text-white dark:text-bg hover:opacity-90 disabled:opacity-60';
export const cardClass = 'flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-sm';
export const errorClass = 'rounded-lg bg-danger-050 px-3 py-2 text-sm text-danger';
export const noticeClass = 'rounded-lg bg-success-050 px-3 py-2 text-sm text-success';
