import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadSite } from '../src/load.js';

/** Build a throwaway site folder from { 'index.html': '...', 'images/a.jpg': 12345 } (a number writes that many bytes). */
export async function makeSite(files) {
  const dir = await mkdtemp(path.join(tmpdir(), 'wfa-'));
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, typeof content === 'number' ? Buffer.alloc(content) : content);
  }
  return loadSite(dir);
}

export const page = (body, head = '') =>
  `<!DOCTYPE html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>T</title>${head}</head><body>${body}</body></html>`;

export const rules = (findings) => findings.map((f) => f.rule);
export const has = (findings, rule) => findings.some((f) => f.rule === rule);
