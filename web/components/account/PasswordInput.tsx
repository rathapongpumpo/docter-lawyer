'use client';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { inputClass } from './styles';

export function PasswordInput({ name, autoComplete, minLength = 10 }: { name: string; autoComplete: string; minLength?: number }) {
  const t = useTranslations('auth');
  const [show, setShow] = useState(false);
  return (
    <span className="relative">
      <input name={name} type={show ? 'text' : 'password'} required minLength={minLength} maxLength={128} autoComplete={autoComplete} className={`${inputClass} pr-11`} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? t('hidePassword') : t('showPassword')}
        className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center text-muted"
      >
        {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
      </button>
    </span>
  );
}
