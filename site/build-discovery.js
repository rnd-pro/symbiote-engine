import fs from 'node:fs';
import path from 'node:path';
import { getCanonicalUrl } from './url.js';

import { docsRoutes } from './docs/routes.js';

const siteDir = path.resolve('_site');

const docsUrls = docsRoutes.map(r => `  <url><loc>${getCanonicalUrl(r.path)}</loc></url>`).join('\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${getCanonicalUrl('/')}</loc></url>
${docsUrls}
  <url><loc>${getCanonicalUrl('/demo/')}</loc></url>
</urlset>`;

fs.writeFileSync(path.join(siteDir, 'sitemap.xml'), sitemap);
