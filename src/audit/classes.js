/**
 * Class-system audit, following Finsweet's Client-First conventions:
 *  - class names are lowercase;
 *  - sections carry a `section_` class;
 *  - combo classes use an `is-` prefix and modify a base class;
 *  - stacks are kept short (the guide advises against stacking more than four).
 * Webflow's own `w-*` classes are ignored throughout.
 */
import * as cheerio from 'cheerio';
import { finding } from '../findings.js';

const MAX_STACK = 4;
const AUTO_NAME = /^(div-block|text-block|heading|image|link-block|section|container|columns|column|paragraph|button|link|list|list-item|text-span|rich-text|form-block|nav-link|brand|embed|video)-\d+$/;
const isBuiltin = (name) => name.startsWith('w-') || name === 'w';

export function cssClassNames(css) {
  const names = new Set();
  // Class selectors only, outside of declarations: strip bodies first so `.5em` values are not mistaken for classes.
  const selectors = css.replace(/\{[^{}]*\}/g, '{}').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of selectors.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) names.add(match[1]);
  return names;
}

export function auditClasses(site) {
  const findings = [];
  const used = new Map(); // class -> pages that use it

  for (const page of site.pages) {
    const $ = cheerio.load(page.html);
    const upper = new Set();
    const deep = [];
    const orphanCombos = new Set();
    const bareSections = [];

    $('[class]').each((_, el) => {
      const classes = ($(el).attr('class') || '').split(/\s+/).filter(Boolean);
      const custom = classes.filter((c) => !isBuiltin(c));
      for (const c of custom) {
        if (!used.has(c)) used.set(c, new Set());
        used.get(c).add(page.file);
        if (/[A-Z]/.test(c)) upper.add(c);
      }
      if (custom.length > MAX_STACK) deep.push(custom.join(' '));
      if (custom.length === 1 && custom[0].startsWith('is-')) orphanCombos.add(custom[0]);
      if (el.tagName === 'section' && !custom.some((c) => c.startsWith('section_'))) {
        bareSections.push(custom.join(' ') || '(no class)');
      }
    });
    // A <section> with no class attribute at all is not visited by [class].
    $('section:not([class])').each(() => bareSections.push('(no class)'));

    if (upper.size) {
      findings.push(finding('CF001', 'warn', `Class names with uppercase letters: ${[...upper].slice(0, 6).join(', ')}`, {
        file: page.file, fix: 'Rename to lowercase; Client-First class names are all lowercase.',
      }));
    }
    if (bareSections.length) {
      findings.push(finding('CF002', 'warn', `${bareSections.length} <section> element(s) without a section_ class (e.g. "${bareSections[0]}")`, {
        file: page.file, fix: 'Give every section a section_<page>_<name> custom class so sections show up as folders.',
      }));
    }
    if (deep.length) {
      findings.push(finding('CF003', 'warn', `${deep.length} element(s) stack more than ${MAX_STACK} classes (e.g. "${deep[0]}")`, {
        file: page.file, fix: 'Merge stacked classes into a combo class or a single custom class.',
      }));
    }
    if (orphanCombos.size) {
      findings.push(finding('CF004', 'error', `Combo class used on its own, with no base class: ${[...orphanCombos].join(', ')}`, {
        file: page.file, fix: 'An is- class only modifies a base class (button is-secondary). Add the base class or rename it.',
      }));
    }
  }

  const auto = [...used.keys()].filter((c) => AUTO_NAME.test(c));
  if (auto.length) {
    findings.push(finding('CF006', 'warn', `${auto.length} auto-generated class name(s) left in use: ${auto.slice(0, 8).join(', ')}${auto.length > 8 ? ', ...' : ''}`, {
      fix: 'Rename to a meaningful custom or utility class. div-block-12 says nothing about what it is for.',
    }));
  }

  const inCss = new Set();
  for (const sheet of site.css) for (const name of cssClassNames(sheet.css)) inCss.add(name);
  const unused = [...inCss].filter((c) => !isBuiltin(c) && !used.has(c));
  if (unused.length) {
    findings.push(finding('CF005', 'info', `${unused.length} class(es) defined in CSS but not used in any page: ${unused.slice(0, 8).join(', ')}${unused.length > 8 ? ', ...' : ''}`, {
      detail: 'Candidates only. A code export omits CMS-bound markup and classes added by scripts, so confirm in the Style Manager in the Designer before deleting.',
    }));
  }
  return findings;
}
