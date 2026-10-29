import type { MetadataRoute } from 'next';

// Web app manifest (tab/home-screen icons). Name is the product name in both languages.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'นิติมิตร',
    short_name: 'นิติมิตร',
    start_url: '/chat',
    display: 'standalone',
    background_color: '#f8f9fa',
    theme_color: '#0066cc',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
