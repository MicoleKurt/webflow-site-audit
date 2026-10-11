/** On-page SEO and accessibility basics that are cheap to check statically. */
import * as cheerio from 'cheerio';
import { finding } from '../findings.js';

const TITLE_MAX = 60;
const DESC_MIN = 50;
const DESC_MAX = 160;

export function auditSeo(site) {
  const findings = [];
  const titles = new Map();

  for (const page of site.pages) {
    const $ = cheerio.load(page.html);
    const f = (rule, severity, message, extra) => findings.push(finding(rule, severity, message, { file: page.file, ...extra }));

    const title = $('head title').first().text().trim();
    if (!title) f('SE001', 'error', 'Missing or empty <title>');
    else {
      if (title.length > TITLE_MAX) f('SE002', 'warn', `Title is ${title.length} characters; search results cut off after about ${TITLE_MAX}`);
      if (!titles.has(title)) titles.set(title, []);
      titles.get(title).push(page.file);
    }

    const desc = ($('meta[name="description"]').attr('content') || '').trim();
    if (!desc) f('SE003', 'warn', 'Missing meta description');
    else if (desc.length < DESC_MIN || desc.length > DESC_MAX) {
      f('SE003', 'info', `Meta description is ${desc.length} characters; aim for ${DESC_MIN} to ${DESC_MAX}`);
    }

    const h1 = $('h1').length;
    if (h1 !== 1) f('SE004', h1 === 0 ? 'error' : 'warn', `${h1} <h1> elements; each page should have exactly one`);

    let prev = 0;
    for (const el of $('h1,h2,h3,h4,h5,h6').toArray()) {
      const level = Number(el.tagName[1]);
      if (prev && level > prev + 1) {
        f('SE005', 'warn', `Heading level skips from h${prev} to h${level}`, { fix: 'Use heading levels in order; style size with classes, not by changing the tag.' });
        break;
      }
      prev = level;
    }

    if (!$('html').attr('lang')) f('SE006', 'warn', 'Missing lang attribute on <html>');
    if (!$('link[rel="canonical"]').length) f('SE007', 'info', 'No canonical link');
    if (!$('meta[property="og:title"]').length || !$('meta[property="og:image"]').length) {
      f('SE008', 'info', 'Open Graph title or image missing; shared links will look bare');
    }

    const emptyLinks = $('a').toArray().filter((el) => {
      const a = $(el);
      return !a.text().trim() && !a.attr('aria-label') && !a.attr('title') && !a.find('img[alt]:not([alt=""])').length;
    });
    if (emptyLinks.length) {
      f('SE009', 'warn', `${emptyLinks.length} link(s) with no accessible name`, { fix: 'Add visible text, aria-label, or an alt on the image inside.' });
    }
    if (/noindex/i.test($('meta[name="robots"]').attr('content') || '')) f('SE011', 'info', 'Page is set to noindex');
  }

  for (const [title, files] of titles) {
    if (files.length > 1) {
      findings.push(finding('SE010', 'warn', `Duplicate title "${title.slice(0, 50)}" on ${files.length} pages: ${files.join(', ')}`));
    }
  }
  return findings;
}
