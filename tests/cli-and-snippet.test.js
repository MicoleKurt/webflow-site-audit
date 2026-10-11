import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { JSDOM } from 'jsdom';
import { auditSite } from '../src/audit/index.js';
import { loadSite } from '../src/load.js';
import { formatJson, formatMarkdown, formatText } from '../src/report.js';
import { makeSite, page } from './helpers.js';

const run = promisify(execFile);
const CLI = new URL('../src/cli.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SAMPLE = new URL('../examples/sample-export', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

async function cli(...args) {
  try {
    const { stdout } = await run(process.execPath, [CLI, ...args]);
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.code, stdout: err.stdout, stderr: err.stderr };
  }
}

// ---------------------------------------------------------------- CLI
test('cli: the sample export fails on errors with exit code 1 and prints findings', async () => {
  const { code, stdout } = await cli('audit', SAMPLE);
  assert.equal(code, 1);
  assert.match(stdout, /CF004/);
  assert.match(stdout, /3 error\(s\)/);
});

test('cli: --fail-on none always exits 0; --only limits the audits', async () => {
  const { code, stdout } = await cli('audit', SAMPLE, '--fail-on', 'none', '--only', 'seo');
  assert.equal(code, 0);
  assert.doesNotMatch(stdout, /CF004/);
  assert.match(stdout, /SE003/);
});

test('cli: --format json is valid and carries a summary', async () => {
  const { stdout } = await cli('audit', SAMPLE, '--format', 'json', '--fail-on', 'none');
  const data = JSON.parse(stdout);
  assert.equal(data.summary.error, 3);
  assert.ok(data.findings.every((f) => f.rule && f.severity && f.message));
});

test('cli: usage errors exit 2 with a message', async () => {
  const none = await cli('audit', 'does-not-exist');
  assert.equal(none.code, 2);
  const unknown = await cli('audit', SAMPLE, '--only', 'nope');
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /Unknown audit/);
  const noToken = await cli('cms', 'audit', '--site', 's1');
  assert.equal(noToken.code, 2);
  assert.match(noToken.stderr, /token is required/);
});

test('loadSite: a folder with no HTML is rejected with guidance', async () => {
  await assert.rejects(makeSite({ 'css/a.css': 'a{}' }), /No \.html files/);
});

test('report formats: text, markdown and json agree on counts', async () => {
  const findings = auditSite(await loadSite(SAMPLE));
  assert.match(formatText(findings), /3 error\(s\), \d+ warning\(s\)/);
  assert.match(formatMarkdown(findings), /^# Webflow site audit/);
  assert.equal(JSON.parse(formatJson(findings)).summary.error, 3);
});

// ---------------------------------------------------------------- snippet, run in a real DOM
async function runSnippet({ reduce }) {
  const source = await readFile(new URL('../snippets/webflow-gsap-base.js', import.meta.url), 'utf8');
  const dom = new JSDOM(page('<div data-anim="fade-up"></div><div data-anim="stagger"><i></i><i></i></div><p data-anim-delay="0.3" data-anim="fade"></p>'), {
    runScripts: 'outside-only',
  });
  const { window } = dom;
  window.document.documentElement.classList.add('wf-anim');
  const calls = { from: [], set: [], registered: [], refreshed: 0 };
  window.gsap = {
    registerPlugin: (p) => calls.registered.push(p),
    utils: { toArray: (sel) => [...window.document.querySelectorAll(sel)] },
    matchMedia: () => ({ add: (conditions, fn) => fn({ conditions: { reduce, motion: !reduce } }) }),
    from: (target, vars) => calls.from.push({ target, vars }),
    set: (target, vars) => calls.set.push({ target, vars }),
  };
  window.ScrollTrigger = { refresh: () => { calls.refreshed += 1; } };
  window.eval(source);
  // Webflow.push callbacks run when Webflow is ready; here the array stands in for that queue.
  window.Webflow.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { window, calls };
}

test('snippet: with motion allowed, each [data-anim] element is revealed once and the head failsafe class is removed', async () => {
  const { window, calls } = await runSnippet({ reduce: false });
  assert.equal(calls.from.length, 3);
  assert.equal(calls.set.length, 0);
  assert.equal(window.document.documentElement.classList.contains('wf-anim'), false);
  const stagger = calls.from.find((c) => c.vars.stagger === 0.1);
  assert.equal(stagger.target.length, 2, 'stagger animates the two children');
  assert.equal(calls.from.find((c) => c.vars.delay === 0.3).vars.autoAlpha, 0);
  assert.ok(calls.from.every((c) => c.vars.scrollTrigger.once === true));
});

test('snippet: with reduced motion nothing is animated and everything is shown', async () => {
  const { calls } = await runSnippet({ reduce: true });
  assert.equal(calls.from.length, 0);
  assert.equal(calls.set.length, 1);
  assert.equal(calls.set[0].vars.autoAlpha, 1);
  assert.equal(calls.set[0].target.length, 3);
});

test('snippet: if GSAP failed to load, content is not left hidden', async () => {
  const source = await readFile(new URL('../snippets/webflow-gsap-base.js', import.meta.url), 'utf8');
  const dom = new JSDOM(page('<div data-anim="fade"></div>'), { runScripts: 'outside-only' });
  dom.window.document.documentElement.classList.add('wf-anim');
  dom.window.eval(source);
  assert.equal(dom.window.document.documentElement.classList.contains('wf-anim'), false);
});
