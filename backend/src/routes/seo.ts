import { Router } from 'express';
import { config } from '../config';

const router = Router();

/**
 * GET /sitemap.xml
 *
 * Generates an XML sitemap for search engine crawlers listing all
 * public-facing pages with priority and change-frequency hints.
 */
router.get('/sitemap.xml', (_req, res) => {
  const baseUrl = config.frontend.url.replace(/\/$/, '');

  const pages: Array<{
    loc: string;
    changefreq: string;
    priority: string;
  }> = [
    { loc: '/', changefreq: 'weekly', priority: '1.0' },
    { loc: '/pricing', changefreq: 'monthly', priority: '0.9' },
    { loc: '/developers', changefreq: 'monthly', priority: '0.8' },
    { loc: '/docs', changefreq: 'monthly', priority: '0.8' },
    { loc: '/use-cases', changefreq: 'monthly', priority: '0.7' },
    { loc: '/compare/common-room', changefreq: 'monthly', priority: '0.7' },
    { loc: '/compare/reo-dev', changefreq: 'monthly', priority: '0.7' },
    { loc: '/changelog', changefreq: 'weekly', priority: '0.5' },
    { loc: '/login', changefreq: 'yearly', priority: '0.5' },
    { loc: '/register', changefreq: 'yearly', priority: '0.6' },
    { loc: '/terms', changefreq: 'yearly', priority: '0.3' },
    { loc: '/privacy', changefreq: 'yearly', priority: '0.3' },
  ];

  const urlEntries = pages
    .map(
      (page) => `  <url>
    <loc>${baseUrl}${page.loc}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // 24h
  res.send(xml);
});

/**
 * GET /robots.txt
 *
 * Tells search engine crawlers which paths are public and which are private.
 * References the sitemap for discovery.
 */
router.get('/robots.txt', (_req, res) => {
  const baseUrl = config.frontend.url.replace(/\/$/, '');

  const txt = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /settings
Disallow: /billing
Disallow: /onboarding
Disallow: /team
Disallow: /audit
Disallow: /import/
Disallow: /webhooks
Disallow: /sso-settings
Disallow: /dashboard-builder
Disallow: /sequences

Sitemap: ${baseUrl}/sitemap.xml
`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // 24h
  res.send(txt);
});

export default router;
