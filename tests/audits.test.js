import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { auditClasses } from '../src/audit/classes.js';
import { auditFinsweet } from '../src/audit/finsweet.js';
import { auditGsap, tweenTopLevelProps } from '../src/audit/gsap.js';
import { auditPerformance } from '../src/audit/performance.js';
import { auditResponsive } from '../src/audit/responsive.js';
import { auditSeo } from '../src/audit/seo.js';
import { has, makeSite, page } from './helpers.js';

// ---------------------------------------------------------------- Client-First classes
test('a clean Client-First page raises no class findings', async () => {
  const site = await makeSite({
    'index.html': page('<section class="section_home_hero"><div class="padding-global"><a class="button is-secondary">Go</a></div></section>'),
    'css/a.css': '.section_home_hero{color:red}.padding-global{margin:0}.button{x:y}.button.is-secondary{x:z}',
  });
  assert.deepEqual(auditClasses(site), []);
});

test('flags uppercase, bare sections, deep stacks, orphan combos and auto names', async () => {
  const site = await makeSite({
    'index.html': page('<section class="Hero"><div class="a b c d e"></div><div class="is-big"></div><div class="div-block-9"></div></section><section></section>'),
  });
  const f = auditClasses(site);
  for (const rule of ['CF001', 'CF002', 'CF003', 'CF004', 'CF006']) assert.ok(has(f, rule), rule);
  assert.ok(f.find((x) => x.rule === 'CF002').message.startsWith('2 <section>'));
});

test('ignores Webflow built-in w- classes and reports unused CSS as a candidate only', async () => {
  const site = await makeSite({
    'index.html': page('<div class="w-nav w-dyn-item"></div>'),
    'css/a.css': '.w-nav{x:y}.orphan_card{x:y}',
  });
  const f = auditClasses(site);
  assert.deepEqual(f.map((x) => x.rule), ['CF005']);
  assert.equal(f[0].severity, 'info');
  assert.match(f[0].message, /orphan_card/);
});

// ---------------------------------------------------------------- responsive
test('responsive: viewport, odd breakpoints, fixed widths, 100vw, 100vh', async () => {
  const site = await makeSite({
    'index.html': '<html><head></head><body></body></html>',
    'css/a.css': '.wide{width:900px}.full{width:100vw}.tall{height:100vh}body{overflow-x:hidden}@media (max-width:1024px){.x{a:b}}',
  });
  const f = auditResponsive(site);
  for (const rule of ['RS001', 'RS002', 'RS003', 'RS004', 'RS005', 'RS006']) assert.ok(has(f, rule), rule);
});

test('responsive: a mobile override clears the fixed-width warning; standard breakpoints are fine', async () => {
  const site = await makeSite({
    'index.html': page(''),
    'css/a.css': '.wide{width:900px}@media (max-width:991px){.x{a:b}}@media (max-width:767px){.wide{width:100%}}@media (min-width:1280px){.y{a:b}}',
  });
  assert.deepEqual(auditResponsive(site), []);
});

test('responsive: unparseable CSS is reported, not thrown', async () => {
  const site = await makeSite({ 'index.html': page(''), 'css/a.css': '.a{color:red' });
  assert.ok(has(auditResponsive(site), 'RS000'));
});

// ---------------------------------------------------------------- performance
test('performance: image attributes, lazy-loading the hero, blocking scripts, fonts', async () => {
  const site = await makeSite({
    'index.html': page(
      '<img src="a.jpg" loading="lazy"><img src="b.jpg" alt="b" width="1" height="1"><img src="c.jpg" alt="c" width="1" height="1"><img src="d.jpg" alt="d" width="1" height="1">',
      '<script src="https://x.test/lib.js"></script><script src="https://x.test/ok.js" defer></script>'
    ),
    'css/a.css': '@font-face{font-family:A;src:url(a.woff2)}@import url(b.css);',
  });
  const f = auditPerformance(site);
  for (const rule of ['PF001', 'PF002', 'PF003', 'PF004', 'PF005', 'PF006', 'PF009']) assert.ok(has(f, rule), rule);
  assert.equal(f.find((x) => x.rule === 'PF005').message.includes('ok.js'), false);
});

test('performance: image weight thresholds', async () => {
  const site = await makeSite({
    'index.html': page(''),
    'images/small.jpg': 10 * 1024,
    'images/mid.jpg': 250 * 1024,
    'images/big.png': 600 * 1024,
    'images/ok.webp': 150 * 1024,
    'images/note.jpg': 120 * 1024,
  });
  const f = auditPerformance(site).filter((x) => x.file?.startsWith('images/'));
  const bySeverity = Object.fromEntries(f.map((x) => [x.file, x.severity]));
  assert.deepEqual(bySeverity, { 'images/big.png': 'error', 'images/mid.jpg': 'warn', 'images/note.jpg': 'info' });
});

// ---------------------------------------------------------------- SEO
test('seo: flags missing basics and duplicate titles', async () => {
  const bad = '<html><head><title>Same</title></head><body><h2>a</h2><h4>b</h4><a href="/x"></a></body></html>';
  const f = auditSeo(await makeSite({ 'a.html': bad, 'b.html': bad }));
  for (const rule of ['SE003', 'SE004', 'SE005', 'SE006', 'SE009', 'SE010']) assert.ok(has(f, rule), rule);
});

test('seo: a well-formed page is clean', async () => {
  const html =
    '<!DOCTYPE html><html lang="en"><head><title>Home</title><meta name="description" content="A description that is comfortably between fifty and one hundred sixty characters long."><link rel="canonical" href="/"><meta property="og:title" content="t"><meta property="og:image" content="i"></head><body><h1>Hi</h1><h2>There</h2><a href="/">Home</a></body></html>';
  assert.deepEqual(auditSeo(await makeSite({ 'index.html': html })), []);
});

// ---------------------------------------------------------------- Finsweet
const list = (fields = '<div fs-list-field="category">Cat</div>') =>
  `<div fs-list-element="list" class="w-dyn-items"><div class="w-dyn-item">${fields}</div></div>`;
const filters = (field) => `<form fs-list-element="filters"><input type="checkbox" fs-list-field="${field}" fs-list-value="a"></form>`;
const fsScript = '<script async type="module" src="https://cdn.jsdelivr.net/npm/@finsweet/attributes@2/attributes.js" fs-list></script>';

test('finsweet: matching filter and list fields pass', async () => {
  assert.deepEqual(auditFinsweet(await makeSite({ 'index.html': page(filters('category') + list(), fsScript) })), []);
});

test('finsweet: a field name case mismatch is an error and names the near match', async () => {
  const f = auditFinsweet(await makeSite({ 'index.html': page(filters('Category') + list(), fsScript) })).find((x) => x.rule === 'FS002');
  assert.equal(f.severity, 'error');
  assert.match(f.message, /Category \(list has "category"\)/);
});

test('finsweet: filters without a list, field on the list element, stray fs-list-value, no script', async () => {
  assert.ok(has(auditFinsweet(await makeSite({ 'index.html': page(filters('x'), fsScript) })), 'FS003'));
  assert.ok(has(auditFinsweet(await makeSite({ 'index.html': page('<div fs-list-element="list" fs-list-field="loc"></div>', fsScript) })), 'FS004'));
  assert.ok(has(auditFinsweet(await makeSite({ 'index.html': page('<div fs-list-value="a"></div>', fsScript) })), 'FS005'));
  assert.ok(has(auditFinsweet(await makeSite({ 'index.html': page(list()) })), 'FS006'));
});

test('finsweet: v1 markup is an error under the v2 script and a note under the v1 script', async () => {
  const body = '<div fs-cmsfilter-element="list"></div>';
  const v2 = await makeSite({ 'index.html': page(body, fsScript) });
  assert.equal(auditFinsweet(v2).find((x) => x.rule === 'FS001').severity, 'error');
  const v1 = await makeSite({
    'index.html': page(body, '<script src="https://cdn.jsdelivr.net/npm/@finsweet/attributes-cmsfilter@1/cmsfilter.js"></script>'),
  });
  assert.equal(auditFinsweet(v1).find((x) => x.rule === 'FS001').severity, 'info');
});

test('finsweet: a code export has no CMS items, so field matching is reported as unverifiable, not an error', async () => {
  const site = await makeSite({ 'index.html': page(filters('category') + '<div fs-list-element="list"></div>', fsScript) });
  assert.equal(auditFinsweet(site).find((x) => x.rule === 'FS002').severity, 'info');
});

test('finsweet: unknown element values and case-only field variants', async () => {
  const body =
    '<div fs-list-element="lisst"></div>' + filters('a') + list('<i fs-list-field="Topic"></i><i fs-list-field="topic"></i><i fs-list-field="a"></i>');
  const f = auditFinsweet(await makeSite({ 'index.html': page(body, fsScript) }));
  assert.ok(has(f, 'FS007'));
  assert.ok(has(f, 'FS008'));
});

// ---------------------------------------------------------------- GSAP
const gsapHead = '<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js" defer></script>';
const inline = (code) => `<script>${code}</script>`;

test('gsap: unregistered ScrollTrigger, no matchMedia, no reduced motion, markers, onload, layout tweens', async () => {
  const code =
    'window.onload = function(){ gsap.to(".a", { width: 300, scrollTrigger: { trigger: ".a", markers: true } }); }; ScrollTrigger.create({});';
  const f = auditGsap(await makeSite({ 'index.html': page(inline(code), gsapHead) }));
  for (const rule of ['GS001', 'GS002', 'GS003', 'GS004', 'GS005', 'GS008', 'GS009']) assert.ok(has(f, rule), rule);
});

test('gsap: tweenTopLevelProps ignores keys inside nested objects', () => {
  const props = tweenTopLevelProps('gsap.to(".a", { x: 10, scrollTrigger: { trigger: ".a", top: 5 } })');
  assert.equal(props.length, 1);
  assert.match(props[0], /x: 10/);
  assert.doesNotMatch(props[0], /top/);
});

test('gsap: duplicate core loads and IX2 + GSAP on one page', async () => {
  const f = auditGsap(await makeSite({ 'index.html': page('<div data-w-id="x"></div>', gsapHead + gsapHead) }));
  assert.ok(has(f, 'GS006'));
  assert.ok(has(f, 'GS007'));
});

test('gsap: pages without GSAP get no GSAP findings', async () => {
  assert.deepEqual(auditGsap(await makeSite({ 'index.html': page('<p>hi</p>') })), []);
});

test('gsap: the bundled snippet passes its own audit with no errors or warnings', async () => {
  const snippet = await readFile(new URL('../snippets/webflow-gsap-base.js', import.meta.url), 'utf8');
  const site = await makeSite({ 'index.html': page('', gsapHead), 'js/site.js': snippet });
  assert.deepEqual(auditGsap(site).filter((x) => x.severity !== 'info'), []);
});
