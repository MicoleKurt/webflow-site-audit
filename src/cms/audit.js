/** CMS content audit: data quality problems that break pages, SEO or accessibility. */
import { finding } from '../findings.js';

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const META_DESC = /meta.*desc|seo.*desc/i;
const NAME_MAX = 70;

const isEmpty = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

/**
 * @param {{displayName: string, fields?: {slug: string, type: string, isRequired?: boolean, displayName?: string}[]}} collection
 * @param {object[]} items  items as returned by the Data API (fieldData, isDraft, isArchived, lastPublished, lastUpdated)
 */
export function auditCollection(collection, items) {
  const findings = [];
  const where = collection.displayName;
  const add = (rule, severity, message, extra) => findings.push(finding(rule, severity, message, { file: where, ...extra }));
  const fields = collection.fields ?? [];
  const live = items.filter((i) => !i.isArchived);
  const label = (item) => `"${(item.fieldData?.name ?? item.id).toString().slice(0, 40)}"`;

  for (const field of fields.filter((f) => f.isRequired)) {
    const bad = live.filter((i) => isEmpty(i.fieldData?.[field.slug]));
    if (bad.length) add('CM001', 'error', `${bad.length} item(s) with required field "${field.slug}" empty, e.g. ${label(bad[0])}`);
  }

  const slugs = new Map();
  const names = new Map();
  for (const item of live) {
    const slug = item.fieldData?.slug;
    if (slug) slugs.set(slug, [...(slugs.get(slug) ?? []), item]);
    const name = item.fieldData?.name?.trim().toLowerCase();
    if (name) names.set(name, [...(names.get(name) ?? []), item]);
  }
  for (const [slug, group] of slugs) if (group.length > 1) add('CM002', 'warn', `Slug "${slug}" is used by ${group.length} items`);
  for (const [, group] of names) if (group.length > 1) add('CM002', 'info', `Name ${label(group[0])} is used by ${group.length} items`);

  const badSlugs = live.filter((i) => i.fieldData?.slug && !KEBAB.test(i.fieldData.slug));
  if (badSlugs.length) {
    add('CM003', 'warn', `${badSlugs.length} slug(s) are not lowercase kebab-case, e.g. "${badSlugs[0].fieldData.slug}"`, {
      detail: 'Changing a slug breaks links to the old URL; add a redirect first.',
    });
  }

  for (const field of fields.filter((f) => META_DESC.test(f.slug))) {
    const empty = live.filter((i) => isEmpty(i.fieldData?.[field.slug]));
    if (empty.length) add('CM004', 'warn', `${empty.length} item(s) with empty "${field.slug}", e.g. ${label(empty[0])}`);
    const wrong = live.filter((i) => typeof i.fieldData?.[field.slug] === 'string' && !isEmpty(i.fieldData[field.slug]) && (i.fieldData[field.slug].length < 50 || i.fieldData[field.slug].length > 160));
    if (wrong.length) add('CM005', 'info', `${wrong.length} "${field.slug}" value(s) outside 50 to 160 characters`);
  }

  for (const field of fields.filter((f) => f.type === 'Image')) {
    const noAlt = live.filter((i) => {
      const v = i.fieldData?.[field.slug];
      return v && typeof v === 'object' && v.url && isEmpty(v.alt);
    });
    if (noAlt.length) add('CM010', 'warn', `${noAlt.length} item(s) with an image in "${field.slug}" and no alt text`);
  }

  const drafts = items.filter((i) => i.isDraft && !i.isArchived);
  if (drafts.length) add('CM006', 'info', `${drafts.length} draft item(s) not published`);
  const pending = live.filter((i) => !i.isDraft && i.lastPublished && i.lastUpdated && new Date(i.lastUpdated) > new Date(i.lastPublished));
  if (pending.length) add('CM007', 'info', `${pending.length} published item(s) have edits newer than their last publish`);
  const archived = items.length - live.length;
  if (archived) add('CM008', 'info', `${archived} archived item(s)`);
  const longNames = live.filter((i) => (i.fieldData?.name ?? '').length > NAME_MAX);
  if (longNames.length) add('CM009', 'info', `${longNames.length} item name(s) over ${NAME_MAX} characters`);
  return findings;
}
