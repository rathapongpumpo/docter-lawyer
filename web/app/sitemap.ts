import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

// Only the public pages: legal texts and the sign-in/sign-up pages. The library, statutes, guides and templates are
// behind sign-in, so they are not listed (see robots.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.appUrl.replace(/\/$/, '');
  return ['/login', '/register', '/legal/terms', '/legal/privacy'].map((path) => ({ url: `${base}${path}` }));
}
