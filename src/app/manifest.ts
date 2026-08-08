import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Hyper — Social Connection',
    short_name: 'Hyper',
    description: 'Connect with friends, share stories, join communities, and explore new conversations.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2563eb',
    icons: [
      {
        src: '/og-image.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/og-image.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
