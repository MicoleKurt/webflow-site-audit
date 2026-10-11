/**
 * Finsweet Attributes audit (list filtering). Rules come from the official List Filter page and from recurring
 * failure reports on the Finsweet forum:
 *  - a filter's fs-list-field must match a field inside the list items exactly (case-sensitive);
 *  - fs-list-field on the same element as the list is taken as the list's main field and hides the inner ones;
 *  - v1 attributes (fs-cmsfilter-*, fs-cmsload-*, ...) do nothing under Attributes v2.
 * A Webflow code export contains no CMS items, so the field cross-check needs saved pages from the published site.
 */
import * as cheerio from 'cheerio';
import { finding } from '../findings.js';

// Values documented for fs-list-element on the List Filter page.
const KNOWN_ELEMENTS = new Set([
  'list', 'filters', 'clear', 'items-count', 'results-count', 'tag', 'tag-field', 'tag-value', 'tag-operator',
  'tag-remove', 'scroll-anchor', 'empty', 'initial',
]);
const V1_ATTR = /^fs-cms[a-z]+(-|$)/;

export function scriptVersion($) {
  const srcs = $('script[src]').toArray().map((el) => el.attribs.src || '');
  if (srcs.some((s) => /finsweet\/attributes-cms|attributes-cmsfilter|cmsfilter\.js/i.test(s))) return 'v1';
  if (srcs.some((s) => /finsweet\/attributes(@|\/|\.js)|finsweet\.com\/attributes/i.test(s))) return 'v2';
  return null;
}

export function auditFinsweet(site) {
  const findings = [];

  for (const page of site.pages) {
    const $ = cheerio.load(page.html);
    const f = (rule, severity, message, extra) => findings.push(finding(rule, severity, message, { file: page.file, ...extra }));

    const all = $('*').toArray();
    const attrsOf = (el) => Object.keys(el.attribs || {}).filter((a) => a.startsWith('fs-'));
    const withFs = all.filter((el) => attrsOf(el).length);
    const loaded = scriptVersion($);
    if (!withFs.length) {
      if (loaded === 'v2' && !$('script[fs-list]').length) {
        // Loaded but nothing to act on: only worth a note, the script may serve other attributes.
        f('FS006', 'info', 'Finsweet Attributes script is loaded but no fs- attributes are used on this page');
      }
      continue;
    }
    if (!loaded) {
      f('FS006', 'warn', 'fs- attributes are used but no Finsweet Attributes script was found on the page', {
        fix: 'Add the Attributes script to the page or site footer, or the attributes do nothing.',
      });
    }

    // v1 attributes
    const legacy = new Set();
    for (const el of withFs) for (const a of attrsOf(el)) if (V1_ATTR.test(a)) legacy.add(a);
    if (legacy.size) {
      f('FS001', loaded === 'v1' ? 'info' : 'error', `Attributes v1 markup (${[...legacy].slice(0, 4).join(', ')}) ${loaded === 'v1' ? 'with the v1 script' : 'will not work with Attributes v2'}`, {
        fix: 'Migrate to fs-list-element / fs-list-field, or keep the v1 script loaded.',
      });
    }

    const lists = all.filter((el) => el.attribs['fs-list-element'] === 'list');
    const filters = all.filter((el) => el.attribs['fs-list-element'] === 'filters');
    if (filters.length && !lists.length) {
      f('FS003', 'error', 'A filters form (fs-list-element="filters") is present but no list (fs-list-element="list") is on the page');
    }

    for (const el of all) {
      const v = el.attribs['fs-list-element'];
      if (v && !KNOWN_ELEMENTS.has(v)) f('FS007', 'info', `Unrecognised fs-list-element="${v}"`, { detail: 'Not in the documented list; check the spelling against the List Filter page.' });
      if (v === 'list' && el.attribs['fs-list-field']) {
        f('FS004', 'warn', `fs-list-field="${el.attribs['fs-list-field']}" sits on the same element as the list, so it can shadow the inner fields`, {
          fix: 'Move fs-list-field onto the elements inside each collection item.',
        });
      }
      if (el.attribs['fs-list-value'] !== undefined) {
        const t = (el.attribs.type || '').toLowerCase();
        const inner = $(el).find('input[type=checkbox],input[type=radio]').length;
        if (el.tagName === 'input' ? !['checkbox', 'radio'].includes(t) : !inner) {
          f('FS005', 'warn', `fs-list-value="${el.attribs['fs-list-value']}" is on an element that is not a checkbox or radio`, {
            detail: 'fs-list-value is documented for checkbox and radio inputs.',
          });
        }
      }
    }

    // Cross-check: every filter field must exist inside a list item.
    const listFields = new Set();
    for (const list of lists) {
      $(list).find('[fs-list-field]').each((_, el) => listFields.add(el.attribs['fs-list-field']));
    }
    if (lists.length && filters.length) {
      const missing = new Set();
      for (const form of filters) {
        $(form).find('[fs-list-field]').each((_, el) => {
          const name = el.attribs['fs-list-field'];
          if (!listFields.has(name)) missing.add(name);
        });
      }
      if (listFields.size === 0) {
        f('FS002', 'info', 'No fs-list-field found inside the list; if this is a code export the CMS items are not included, so the filter fields cannot be cross-checked', {
          detail: 'Run the audit on pages saved from the published site to check field names.',
        });
      } else if (missing.size) {
        const near = [...missing].map((m) => {
          const hit = [...listFields].find((l) => l.toLowerCase() === m.toLowerCase());
          return hit ? `${m} (list has "${hit}")` : m;
        });
        f('FS002', 'error', `Filter field(s) with no matching field in the list items: ${near.join(', ')}`, {
          fix: 'fs-list-field values must match exactly, including case.',
        });
      }
      const lower = new Map();
      for (const name of listFields) {
        const k = name.toLowerCase();
        if (!lower.has(k)) lower.set(k, new Set());
        lower.get(k).add(name);
      }
      for (const variants of lower.values()) {
        if (variants.size > 1) f('FS008', 'warn', `fs-list-field names differ only by case: ${[...variants].join(', ')}`);
      }
    }
  }
  return findings;
}
