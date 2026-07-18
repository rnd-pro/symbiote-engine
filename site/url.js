export const BASE_PATH = process.env.BASE_PATH || '';
export const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * Projects a repository-relative path to a canonical root-relative path
 * safe for routing within the GitHub Pages deployment.
 *
 * @param {string} path - The repository-relative path, e.g. '/docs/' or 'demo/'
 * @returns {string} The canonical root-relative path including BASE_PATH.
 */
export function getCanonicalPath(path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_PATH}${cleanPath}`;
}

/**
 * Projects a repository-relative path to an absolute URL.
 *
 * @param {string} path - The repository-relative path
 * @returns {string} The canonical absolute URL including BASE_URL.
 */
export function getCanonicalUrl(path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_URL}${cleanPath}`;
}
