import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg']);
const SKIP_DIRS = new Set(['node_modules', '.git']);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

/**
 * Load a directory of pages: an unzipped Webflow code export, or pages saved from the published site.
 * (A code export contains no CMS items, so checks that need CMS-bound markup want saved published pages.)
 */
export async function loadSite(dir) {
  const site = { dir, pages: [], css: [], js: [], images: [] };
  for (const file of await walk(dir)) {
    const rel = path.relative(dir, file).split(path.sep).join('/');
    const ext = path.extname(file).toLowerCase();
    if (ext === '.html' || ext === '.htm') site.pages.push({ file: rel, html: await readFile(file, 'utf8') });
    else if (ext === '.css') site.css.push({ file: rel, css: await readFile(file, 'utf8') });
    else if (ext === '.js' || ext === '.mjs') site.js.push({ file: rel, js: await readFile(file, 'utf8') });
    else if (IMAGE_EXT.has(ext)) site.images.push({ file: rel, ext, bytes: (await stat(file)).size });
  }
  if (site.pages.length === 0) {
    throw new Error(`No .html files found in ${dir}. Point this at an unzipped Webflow code export or a folder of saved pages.`);
  }
  site.pages.sort((a, b) => a.file.localeCompare(b.file));
  return site;
}
