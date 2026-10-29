import type { MetadataRoute } from 'next';

// The whole app sits behind sign-in (guest mode included), so nothing in it is meant for search engines yet.
// Only the public legal pages are open. Opening the library for SEO is a product decision (docs/03 §7.12).
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: ['/legal/'], disallow: ['/api/', '/admin/', '/chat', '/share/', '/print/', '/settings', '/org', '/contracts', '/saved', '/library', '/law', '/guides', '/templates', '/manual'] }] };
}
