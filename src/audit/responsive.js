/**
 * Responsive audit. Webflow's breakpoints are fixed: tablet 991px, mobile landscape 767px, mobile portrait 478px
 * (exports sometimes show 479px), and the larger 1280/1440/1920px breakpoints that cascade upward. A media query
 * outside that set usually means the exported CSS was edited by hand, which the next export will overwrite.
 */
import * as cheerio from 'cheerio';
import postcss from 'postcss';
import { finding } from '../findings.js';

const STANDARD = new Set([991, 767, 478, 479, 1280, 1440, 1920]);
const MOBILE_OVERRIDE_MAX = 767;
const WIDE_PX = 600;

function pxValue(value) {
  const m = /^(\d+(?:\.\d+)?)px$/.exec(value.trim());
  return m ? Number(m[1]) : null;
}

export function auditResponsive(site) {
  const findings = [];

  for (const page of site.pages) {
    const $ = cheerio.load(page.html);
    if ($('meta[name="viewport"]').length === 0) {
      findings.push(finding('RS001', 'error', 'No viewport meta tag, so mobile browsers render the desktop layout scaled down', {
        file: page.file, fix: 'Add <meta content="width=device-width, initial-scale=1" name="viewport">.',
      }));
    }
  }

  for (const sheet of site.css) {
    let root;
    try {
      root = postcss.parse(sheet.css);
    } catch (err) {
      findings.push(finding('RS000', 'warn', `Could not parse ${sheet.file}: ${err.reason || err.message}`, { file: sheet.file }));
      continue;
    }

    const odd = new Set();
    const wideBase = new Map(); // selector -> width in px (outside media queries)
    const overridden = new Set(); // selectors that change width inside a small-screen query
    let vw = 0;
    let vh = 0;
    let bodyOverflow = false;

    root.walkAtRules('media', (rule) => {
      for (const m of rule.params.matchAll(/\((max|min)-width:\s*(\d+)px\)/g)) {
        if (!STANDARD.has(Number(m[2]))) odd.add(`${m[1]}-width: ${m[2]}px`);
      }
      const max = /\(max-width:\s*(\d+)px\)/.exec(rule.params);
      if (max && Number(max[1]) <= MOBILE_OVERRIDE_MAX) {
        rule.walkRules((r) => {
          if (r.nodes?.some((d) => d.type === 'decl' && /^(width|min-width|max-width)$/.test(d.prop))) {
            r.selectors.forEach((s) => overridden.add(s));
          }
        });
      }
    });

    root.walkDecls((decl) => {
      const insideMedia = decl.parent?.parent?.type === 'atrule';
      if (/^(width|min-width)$/.test(decl.prop)) {
        if (/\b100vw\b/.test(decl.value)) vw += 1;
        const px = pxValue(decl.value);
        if (!insideMedia && px !== null && px >= WIDE_PX) {
          for (const s of decl.parent.selectors || []) wideBase.set(s, px);
        }
      }
      if (/^(height|min-height)$/.test(decl.prop) && /\b100vh\b/.test(decl.value)) vh += 1;
      if (decl.prop === 'overflow-x' && decl.value.trim() === 'hidden') {
        if (/^(html|body)\b/.test(decl.parent.selector || '')) bodyOverflow = true;
      }
    });

    if (odd.size) {
      findings.push(finding('RS002', 'warn', `Non-standard breakpoint(s): ${[...odd].join(', ')}`, {
        file: sheet.file, detail: 'Webflow has no custom breakpoints. Hand-edited values are lost on the next export.',
      }));
    }
    const risky = [...wideBase].filter(([sel]) => !overridden.has(sel));
    if (risky.length) {
      const sample = risky.slice(0, 4).map(([s, w]) => `${s} (${w}px)`).join(', ');
      findings.push(finding('RS003', 'warn', `${risky.length} selector(s) set a fixed width of ${WIDE_PX}px or more with no override at 767px or below: ${sample}`, {
        file: sheet.file, fix: 'Use max-width with a percentage or rem width, or override the width at the mobile breakpoints.',
      }));
    }
    if (vw) {
      findings.push(finding('RS004', 'warn', `${vw} declaration(s) use 100vw, which includes the scrollbar width and causes horizontal scroll`, {
        file: sheet.file, fix: 'Use 100% (or width: auto) instead of 100vw.',
      }));
    }
    if (vh) {
      findings.push(finding('RS006', 'info', `${vh} declaration(s) use 100vh; on mobile this ignores the browser toolbar and can push content off screen`, {
        file: sheet.file, fix: 'Add a 100dvh declaration after it (browsers without dvh keep the vh value).',
      }));
    }
    if (bodyOverflow) {
      findings.push(finding('RS005', 'info', 'overflow-x: hidden on html/body hides horizontal overflow instead of fixing what causes it', {
        file: sheet.file, detail: 'Find the element wider than the viewport (often a 100vw child or a negative margin) and fix that.',
      }));
    }
  }
  return findings;
}
