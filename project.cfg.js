export default {
  static: {
    sourceDir: './site',
    outputDir: './_site',
    entryPatterns: ['*.html.js', '**/*.html.js', '**/index.js'],
    copy: [{ from: './site/static-assets', to: './' }],
  },
  bundle: {
    js: true,
    css: true,
    exclude: [],
  },
  minify: {
    js: true,
    css: true,
    html: true,
    svg: true,
    exclude: [],
  },
  importmap: {
    packageList: ['node:fs/promises', 'node:fs', 'node:path', 'node:crypto', 'node:process'],
  },
};
