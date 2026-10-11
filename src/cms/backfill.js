/**
 * Backfill an empty CMS field from another one (for example meta-description from a summary). Writes are
 * planned first and only sent with apply=true. Slugs are never touched, and `isDraft` is never sent, so an
 * edit stays a draft change until the item or site is published.
 */

const isEmpty = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/** Trim to maxLength on a word boundary, without adding punctuation. */
export function truncateAtWord(text, maxLength) {
  const clean = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  const cut = clean.slice(0, maxLength + 1);
  const space = cut.lastIndexOf(' ');
  return (space > maxLength * 0.6 ? cut.slice(0, space) : cut.slice(0, maxLength)).replace(/[\s,;:.-]+$/, '');
}

export function planBackfill(items, { from, to, maxLength = 160 }) {
  if (from === 'slug' || to === 'slug' || to === 'name') throw new Error('Refusing to rewrite slug or name: changing them breaks live URLs.');
  const plan = [];
  for (const item of items) {
    if (item.isArchived) continue;
    const source = item.fieldData?.[from];
    if (isEmpty(item.fieldData?.[to]) && typeof source === 'string' && !isEmpty(source)) {
      plan.push({ id: item.id, name: item.fieldData?.name, value: truncateAtWord(source, maxLength) });
    }
  }
  return plan;
}

export async function applyBackfill(client, collectionId, plan, to, { apply = false, onProgress = () => {} } = {}) {
  const results = [];
  for (const step of plan) {
    if (apply) await client.updateItem(collectionId, step.id, { [to]: step.value });
    results.push({ ...step, applied: apply });
    onProgress(step, apply);
  }
  return results;
}
