import Image from 'next/image';

// Nitimitr mark (public/theme/logo-nitimitr.png, 48 px source — keep size at or below ~48 for a crisp edge)
export function LogoMark({ size = 34 }: { size?: number }) {
  return <Image src="/theme/logo-nitimitr.png" alt="" width={size} height={size} unoptimized aria-hidden="true" className="shrink-0 rounded-[10px]" />;
}
