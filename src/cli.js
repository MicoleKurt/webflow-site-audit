#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { AUDITS, auditSite } from './audit/index.js';
import { auditCollection } from './cms/audit.js';
import { applyBackfill, planBackfill } from './cms/backfill.js';
import { WebflowClient } from './cms/client.js';
import { exceeds } from './findings.js';
import { loadSite } from './load.js';
import { formatJson, formatMarkdown, formatText } from './report.js';

const HELP = `wfa: audit a Webflow site

  wfa audit <dir> [--only classes,responsive,performance,seo,finsweet,gsap]
                  [--format text|md|json] [--fail-on error|warn|none]
      <dir> is an unzipped Webflow code export, or pages saved from the published site.

  wfa cms audit --site <site_id> [--collection <id>] [--format text|md|json] [--fail-on error|warn|none]
  wfa cms backfill --collection <id> --from <field-slug> --to <field-slug> [--max 160] [--apply]
      Backfill an empty field from another. Dry run unless --apply is given.
      Needs WEBFLOW_TOKEN (cms:read, plus cms:write for --apply).
`;

const FORMATS = { text: formatText, md: formatMarkdown, json: formatJson };

function emit(findings, format) {
  const fn = FORMATS[format];
  if (!fn) throw new Error(`Unknown format "${format}". Use text, md or json.`);
  console.log(fn(findings));
}

function client() {
  return new WebflowClient({ token: process.env.WEBFLOW_TOKEN });
}

async function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      only: { type: 'string' }, format: { type: 'string', default: 'text' }, 'fail-on': { type: 'string', default: 'error' },
      site: { type: 'string' }, collection: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' },
      max: { type: 'string', default: '160' }, apply: { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h' },
    },
  });
  const [command, sub] = positionals;
  if (values.help || !command) {
    console.log(HELP);
    return 0;
  }

  if (command === 'audit') {
    if (!positionals[1]) throw new Error('Give the folder to audit: wfa audit <dir>');
    const only = values.only ? values.only.split(',').map((s) => s.trim()) : Object.keys(AUDITS);
    const findings = auditSite(await loadSite(positionals[1]), only);
    emit(findings, values.format);
    return exceeds(findings, values['fail-on']) ? 1 : 0;
  }

  if (command === 'cms' && sub === 'audit') {
    if (!values.site && !values.collection) throw new Error('Give --site <id> or --collection <id>');
    const api = client();
    const collections = values.collection ? [{ id: values.collection }] : await api.listCollections(values.site);
    const findings = [];
    for (const summary of collections) {
      const collection = await api.getCollection(summary.id);
      findings.push(...auditCollection(collection, await api.listAllItems(summary.id)));
    }
    emit(findings, values.format);
    return exceeds(findings, values['fail-on']) ? 1 : 0;
  }

  if (command === 'cms' && sub === 'backfill') {
    if (!values.collection || !values.from || !values.to) throw new Error('Give --collection, --from and --to');
    const api = client();
    const plan = planBackfill(await api.listAllItems(values.collection), { from: values.from, to: values.to, maxLength: Number(values.max) });
    await applyBackfill(api, values.collection, plan, values.to, {
      apply: values.apply,
      onProgress: (step, applied) => console.log(`${applied ? 'updated' : 'would update'} ${step.name ?? step.id}: ${step.value.slice(0, 70)}`),
    });
    console.log(values.apply ? `Updated ${plan.length} item(s). They are draft changes until you publish.` : `${plan.length} item(s) would change. Re-run with --apply to write.`);
    return 0;
  }

  throw new Error(`Unknown command. Run wfa --help`);
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((err) => {
  console.error(`error: ${err.message}`);
  process.exitCode = 2;
});
