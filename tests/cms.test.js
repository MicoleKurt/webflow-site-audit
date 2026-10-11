import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditCollection } from '../src/cms/audit.js';
import { applyBackfill, planBackfill, truncateAtWord } from '../src/cms/backfill.js';
import { WebflowApiError, WebflowClient } from '../src/cms/client.js';
import { has } from './helpers.js';

const TOKEN = 'wf-secret-token-123';

/** A scripted fake of fetch: returns queued responses and records every request. */
function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, ...init });
    const next = responses.shift();
    const status = next.status ?? 200;
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: new Headers(next.headers ?? {}),
      text: async () => (next.body === undefined ? '' : JSON.stringify(next.body)),
    };
  };
  fn.calls = calls;
  return fn;
}

// ---------------------------------------------------------------- client
test('client: requires a token', () => {
  assert.throws(() => new WebflowClient({}), /token is required/);
});

test('client: sends the bearer token and hits the documented paths', async () => {
  const fetch = fakeFetch([{ body: { collections: [{ id: 'c1' }] } }, { body: { id: 'c1', fields: [] } }]);
  const api = new WebflowClient({ token: TOKEN, fetch });
  assert.deepEqual(await api.listCollections('site 1'), [{ id: 'c1' }]);
  await api.getCollection('c1');
  assert.equal(fetch.calls[0].url, 'https://api.webflow.com/v2/sites/site%201/collections');
  assert.equal(fetch.calls[1].url, 'https://api.webflow.com/v2/collections/c1');
  assert.equal(fetch.calls[0].headers.Authorization, `Bearer ${TOKEN}`);
});

test('client: pages through items 100 at a time using offset', async () => {
  const page = (n, total) => ({ body: { items: Array.from({ length: n }, (_, i) => ({ id: `i${i}` })), pagination: { total } } });
  const fetch = fakeFetch([page(100, 230), page(100, 230), page(30, 230)]);
  const items = await new WebflowClient({ token: TOKEN, fetch }).listAllItems('c1');
  assert.equal(items.length, 230);
  assert.deepEqual(fetch.calls.map((c) => new URL(c.url).searchParams.get('offset')), ['0', '100', '200']);
  assert.equal(new URL(fetch.calls[0].url).searchParams.get('limit'), '100');
});

test('client: waits for Retry-After on 429 and then succeeds', async () => {
  const waits = [];
  const fetch = fakeFetch([{ status: 429, headers: { 'retry-after': '7' }, body: {} }, { body: { items: [], pagination: { total: 0 } } }]);
  const api = new WebflowClient({ token: TOKEN, fetch, sleep: async (ms) => waits.push(ms) });
  assert.deepEqual(await api.listAllItems('c1'), []);
  assert.deepEqual(waits, [7000]);
  assert.equal(fetch.calls.length, 2);
});

test('client: gives up after maxRetries and the error never contains the token', async () => {
  const fetch = fakeFetch(Array.from({ length: 5 }, () => ({ status: 429, headers: { 'retry-after': '1' }, body: { message: 'slow down' } })));
  const api = new WebflowClient({ token: TOKEN, fetch, maxRetries: 2, sleep: async () => {} });
  await assert.rejects(api.getCollection('c1'), (err) => {
    assert.ok(err instanceof WebflowApiError);
    assert.equal(err.status, 429);
    assert.equal(String(err.message).includes(TOKEN), false);
    assert.equal(JSON.stringify(err.body).includes(TOKEN), false);
    return true;
  });
  assert.equal(fetch.calls.length, 3);
});

test('client: other errors are thrown immediately with the status', async () => {
  const fetch = fakeFetch([{ status: 401, body: { message: 'bad token' } }]);
  await assert.rejects(new WebflowClient({ token: TOKEN, fetch }).getCollection('c1'), /HTTP 401: bad token/);
});

test('client: updateItem PATCHes only fieldData', async () => {
  const fetch = fakeFetch([{ body: { id: 'i1' } }]);
  await new WebflowClient({ token: TOKEN, fetch }).updateItem('c1', 'i1', { 'meta-description': 'x' });
  const call = fetch.calls[0];
  assert.equal(call.method, 'PATCH');
  assert.equal(call.url, 'https://api.webflow.com/v2/collections/c1/items/i1');
  assert.deepEqual(JSON.parse(call.body), { fieldData: { 'meta-description': 'x' } });
});

// ---------------------------------------------------------------- content audit
const collection = {
  displayName: 'Projects',
  fields: [
    { slug: 'name', type: 'PlainText', isRequired: true },
    { slug: 'summary', type: 'PlainText', isRequired: true },
    { slug: 'meta-description', type: 'PlainText', isRequired: false },
    { slug: 'main-image', type: 'Image', isRequired: false },
  ],
};
const item = (id, fieldData, extra = {}) => ({ id, fieldData: { name: `Item ${id}`, slug: `item-${id}`, summary: 'S', ...fieldData }, isDraft: false, isArchived: false, ...extra });

test('cms audit: a healthy collection raises nothing', () => {
  const items = [item('1', { 'meta-description': 'x'.repeat(100), 'main-image': { url: 'u', alt: 'a' } })];
  assert.deepEqual(auditCollection(collection, items), []);
});

test('cms audit: required fields, duplicate slugs, bad slugs, meta descriptions, alt text', () => {
  const items = [
    item('1', { summary: '', slug: 'dup' }),
    item('2', { slug: 'dup', 'meta-description': 'too short', 'main-image': { url: 'u', alt: '' } }),
    item('3', { slug: 'Bad Slug' }),
  ];
  const f = auditCollection(collection, items);
  for (const rule of ['CM001', 'CM002', 'CM003', 'CM004', 'CM005', 'CM010']) assert.ok(has(f, rule), rule);
  assert.equal(f.find((x) => x.rule === 'CM001').severity, 'error');
});

test('cms audit: drafts, unpublished edits and archived items are notes; archived items are not checked', () => {
  const items = [
    item('1', {}, { isDraft: true }),
    item('2', {}, { lastPublished: '2026-01-01T00:00:00Z', lastUpdated: '2026-02-01T00:00:00Z' }),
    item('3', { summary: '' }, { isArchived: true }),
  ];
  const f = auditCollection(collection, items);
  assert.ok(has(f, 'CM006') && has(f, 'CM007') && has(f, 'CM008'));
  assert.equal(has(f, 'CM001'), false);
});

// ---------------------------------------------------------------- backfill
test('truncateAtWord: strips HTML, cuts on a word boundary, adds no punctuation', () => {
  assert.equal(truncateAtWord('<p>Short text.</p>', 160), 'Short text.');
  const out = truncateAtWord('word '.repeat(50), 42);
  assert.ok(out.length <= 42);
  assert.ok(out.endsWith('word'));
});

test('backfill: plans only empty targets with a source, and refuses slug and name', () => {
  const items = [
    item('1', { summary: 'From summary', 'meta-description': '' }),
    item('2', { summary: 'Other', 'meta-description': 'Already set' }),
    item('3', { summary: '', 'meta-description': '' }),
    item('4', { summary: 'Archived', 'meta-description': '' }, { isArchived: true }),
  ];
  const plan = planBackfill(items, { from: 'summary', to: 'meta-description' });
  assert.deepEqual(plan.map((p) => [p.id, p.value]), [['1', 'From summary']]);
  assert.throws(() => planBackfill(items, { from: 'summary', to: 'slug' }), /Refusing/);
  assert.throws(() => planBackfill(items, { from: 'slug', to: 'summary' }), /Refusing/);
});

test('backfill: a dry run sends nothing; apply sends one PATCH per planned item', async () => {
  const plan = [{ id: 'i1', name: 'A', value: 'v1' }, { id: 'i2', name: 'B', value: 'v2' }];
  const dry = fakeFetch([]);
  const dryResults = await applyBackfill(new WebflowClient({ token: TOKEN, fetch: dry }), 'c1', plan, 'meta-description');
  assert.equal(dry.calls.length, 0);
  assert.ok(dryResults.every((r) => r.applied === false));

  const live = fakeFetch([{ body: {} }, { body: {} }]);
  await applyBackfill(new WebflowClient({ token: TOKEN, fetch: live }), 'c1', plan, 'meta-description', { apply: true });
  assert.equal(live.calls.length, 2);
  assert.deepEqual(JSON.parse(live.calls[1].body), { fieldData: { 'meta-description': 'v2' } });
});
