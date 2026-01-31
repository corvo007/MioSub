import type { MetadataRoute } from 'next';
import { source } from '@/lib/source';

const baseUrl = 'https://miosub.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = source.getPages();

  const sitemap: MetadataRoute.Sitemap = [
    // Homepage
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/en`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];

  // Add all documentation pages
  for (const page of pages) {
    const url =
      page.locale === 'zh' ? `${baseUrl}${page.url}` : `${baseUrl}/${page.locale}${page.url}`;

    sitemap.push({
      url,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    });
  }

  return sitemap;
}
