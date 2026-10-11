/**
 * GSAP audit: static checks on the scripts of a Webflow site (inline scripts and project JS files; Webflow's own
 * and vendored library files are skipped). These are heuristics, so every message says what was seen, not what is
 * certainly broken. Basis: GSAP's documented gsap.matchMedia() / ScrollTrigger usage.
 */
import * as cheerio from 'cheerio';
import { finding } from '../findings.js';

const VENDOR = /(^|\/)(webflow|gsap|scrolltrigger|jquery|splide|swiper|lenis)[\w.-]*\.js$|\.schunk\.|\.min\.js$/i;
const LAYOUT_PROPS = /\b(width|height|top|left|right|bottom|margin\w*|padding\w*)\s*:/;

/**
 * For each gsap.to/from/fromTo/set call, the text of the properties written directly in its vars object(s),
 * leaving out nested objects such as scrollTrigger: { ... } so their keys are not mistaken for tween properties.
 */
export function tweenTopLevelProps(code) {
  const results = [];
  for (const start of code.matchAll(/gsap\.(?:to|from|fromTo|set)\(/g)) {
    let parens = 1;
    let braces = 0;
    let props = '';
    for (let i = start.index + start[0].length; i < code.length && parens > 0; i += 1) {
      const ch = code[i];
      if (ch === '(') parens += 1;
      else if (ch === ')') parens -= 1;
      else if (ch === '{') { braces += 1; continue; }
      else if (ch === '}') { braces -= 1; continue; }
      if (braces === 1) props += ch;
    }
    results.push(props);
  }
  return results;
}

function gsapSources(site) {
  const sources = [];
  for (const page of site.pages) {
    const $ = cheerio.load(page.html);
    $('script:not([src])').each((_, el) => {
      const code = $(el).text();
      if (code.trim() && $(el).attr('type') !== 'application/ld+json') sources.push({ file: page.file, code });
    });
  }
  for (const js of site.js) if (!VENDOR.test(js.file)) sources.push({ file: js.file, code: js.js });
  return sources;
}

export function auditGsap(site) {
  const findings = [];
  const loadedOn = [];
  for (const page of site.pages) {
    const $ = cheerio.load(page.html);
    const srcs = $('script[src]').toArray().map((el) => el.attribs.src || '');
    const core = srcs.filter((s) => /gsap(\.min)?\.js|gsap@|\/gsap\//i.test(s) && !/ScrollTrigger|ScrollToPlugin|SplitText/i.test(s));
    if (core.length > 1) {
      findings.push(finding('GS006', 'warn', `GSAP core is loaded ${core.length} times on one page`, { file: page.file, fix: 'Load it once.' }));
    }
    if (core.length || $('script:not([src])').text().includes('gsap.')) loadedOn.push(page);
    const ix2 = $('[data-w-id]').length;
    if (core.length && ix2) {
      findings.push(finding('GS007', 'info', `Page has ${ix2} Webflow interaction element(s) (data-w-id) and GSAP; make sure they never animate the same properties of the same element`, { file: page.file }));
    }
  }

  const sources = gsapSources(site);
  const code = sources.map((s) => s.code).join('\n');
  const usesGsap = /\bgsap\./.test(code) || loadedOn.length > 0;
  if (!usesGsap) return findings;

  const usesST = /\bScrollTrigger\b/.test(code);
  if (usesST && !/registerPlugin\([^)]*ScrollTrigger/.test(code)) {
    findings.push(finding('GS001', 'error', 'ScrollTrigger is used but gsap.registerPlugin(ScrollTrigger) was not found', {
      fix: 'Register the plugin once before creating any ScrollTrigger; unregistered, it silently does nothing.',
    }));
  }
  if (usesST && !/gsap\.matchMedia|gsap\.context/.test(code)) {
    findings.push(finding('GS002', 'warn', 'ScrollTrigger is used without gsap.matchMedia() or gsap.context()', {
      fix: 'Wrap setup in gsap.matchMedia() so animations revert on resize and per breakpoint, and so reduced motion can switch them off.',
    }));
  }
  if (!/prefers-reduced-motion/.test(code)) {
    findings.push(finding('GS003', 'warn', 'GSAP animations run but no prefers-reduced-motion handling was found in the site scripts', {
      fix: 'Add a "(prefers-reduced-motion: reduce)" condition in gsap.matchMedia() that skips or shortens the motion.',
    }));
  }
  if (/window\.onload\s*=/.test(code)) {
    findings.push(finding('GS005', 'warn', 'window.onload is assigned, which overwrites any other load handler (including a library\'s)', {
      fix: "Use window.addEventListener('load', ...) or Webflow.push(...).",
    }));
  }
  const ready = /DOMContentLoaded|Webflow\.push|addEventListener\(\s*['"]load['"]|document\.readyState/.test(code);
  if (/\bgsap\.(to|from|fromTo|timeline)\(/.test(code) && !ready) {
    findings.push(finding('GS008', 'warn', 'Tweens are created with no DOM-ready wrapper (DOMContentLoaded, Webflow.push or load)', {
      detail: 'Scripts in <head> run before the elements exist, so the selectors match nothing.',
    }));
  }
  if (/markers\s*:\s*true/.test(code)) {
    findings.push(finding('GS009', 'warn', 'ScrollTrigger markers: true is still enabled', { fix: 'Remove debug markers before publishing.' }));
  }
  const layout = tweenTopLevelProps(code).filter((props) => LAYOUT_PROPS.test(props));
  if (layout.length) {
    findings.push(finding('GS004', 'info', `${layout.length} tween(s) animate layout properties (width, height, top, left, margin or padding)`, {
      detail: 'Layout properties trigger reflow every frame; prefer transforms (x, y, scale) and opacity where the design allows.',
    }));
  }
  return findings;
}
