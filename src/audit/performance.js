/** Page-speed audit: layout shift, LCP image handling, render-blocking scripts and CSS, fonts, image weight. */
import * as cheerio from 'cheerio';
import postcss from 'postcss';
import { finding } from '../findings.js';

export const IMAGE_WARN_BYTES = 200 * 1024;
export const IMAGE_ERROR_BYTES = 500 * 1024;
const MANY_SCRIPTS = 8;
const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

export function auditPerformance(site) {
  const findings = [];

  for (const page of site.pages) {
    const $ = cheerio.load(page.html);
    const imgs = $('body img').toArray();

    const noSize = imgs.filter((el) => !$(el).attr('width') || !$(el).attr('height'));
    if (noSize.length) {
      findings.push(finding('PF001', 'warn', `${noSize.length} image(s) without width and height attributes (layout shift)`, {
        file: page.file, fix: 'Set width and height on every <img> so the browser reserves space before the file loads.',
      }));
    }
    const noAlt = imgs.filter((el) => $(el).attr('alt') === undefined);
    if (noAlt.length) {
      findings.push(finding('PF002', 'error', `${noAlt.length} image(s) with no alt attribute`, {
        file: page.file, fix: 'Describe meaningful images; use alt="" for decorative ones.',
      }));
    }
    const first = imgs[0];
    if (first && $(first).attr('loading') === 'lazy') {
      findings.push(finding('PF003', 'warn', 'The first image on the page is lazy-loaded; if it is the hero it delays Largest Contentful Paint', {
        file: page.file, fix: 'Set loading="eager" (and fetchpriority="high") on the above-the-fold image.',
      }));
    }
    const eager = imgs.slice(2).filter((el) => !$(el).attr('loading'));
    if (eager.length) {
      findings.push(finding('PF004', 'info', `${eager.length} image(s) below the first two have no loading attribute`, {
        file: page.file, fix: 'Set loading="lazy" on images that are not visible on first paint.',
      }));
    }

    const blocking = $('head script[src]').toArray().filter((el) => {
      const a = el.attribs;
      return !('async' in a) && !('defer' in a) && a.type !== 'module';
    });
    if (blocking.length) {
      findings.push(finding('PF005', 'warn', `${blocking.length} render-blocking script(s) in <head>: ${blocking.slice(0, 3).map((el) => el.attribs.src).join(', ')}`, {
        file: page.file, fix: 'Add defer (or async for independent scripts), or move the script to the end of <body>.',
      }));
    }
    const scripts = $('script[src]').length;
    if (scripts > MANY_SCRIPTS) {
      findings.push(finding('PF008', 'info', `${scripts} external scripts on one page`, {
        file: page.file, detail: 'Each one is a request and a parse cost; audit which are still needed.',
      }));
    }
  }

  for (const sheet of site.css) {
    let root;
    try {
      root = postcss.parse(sheet.css);
    } catch {
      continue; // already reported by the responsive audit
    }
    let noDisplay = 0;
    root.walkAtRules('font-face', (rule) => {
      if (!rule.nodes?.some((d) => d.type === 'decl' && d.prop === 'font-display')) noDisplay += 1;
    });
    if (noDisplay) {
      findings.push(finding('PF006', 'warn', `${noDisplay} @font-face rule(s) without font-display`, {
        file: sheet.file, fix: 'Add font-display: swap (or optional) so text is visible while the font loads.',
      }));
    }
    let imports = 0;
    root.walkAtRules('import', () => { imports += 1; });
    if (imports) {
      findings.push(finding('PF009', 'warn', `${imports} CSS @import(s), which load serially and block rendering`, { file: sheet.file }));
    }
  }

  for (const img of site.images) {
    if (img.bytes >= IMAGE_ERROR_BYTES) {
      findings.push(finding('PF007', 'error', `Image is ${kb(img.bytes)}`, { file: img.file, fix: 'Resize to the displayed size and export as WebP or AVIF.' }));
    } else if (img.bytes >= IMAGE_WARN_BYTES) {
      findings.push(finding('PF007', 'warn', `Image is ${kb(img.bytes)}`, { file: img.file, fix: 'Compress, or convert to WebP/AVIF.' }));
    } else if (img.bytes >= 100 * 1024 && (img.ext === '.jpg' || img.ext === '.jpeg' || img.ext === '.png')) {
      findings.push(finding('PF010', 'info', `${img.ext.slice(1).toUpperCase()} image is ${kb(img.bytes)}; WebP or AVIF would be smaller`, { file: img.file }));
    }
  }
  return findings;
}
