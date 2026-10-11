# Research notes

What was looked up before writing the rules, what it established, and what it did not.

## Webflow Data API v2

Source: [developers.webflow.com](https://developers.webflow.com/data/reference/cms/collection-items/staged-items/list-items) reference pages.

* `GET /v2/sites/{site_id}/collections` returns `collections[]` (`id`, `displayName`, `singularName`, `slug`).
* `GET /v2/collections/{collection_id}` returns the collection with a `fields[]` array (`slug`, `type`, `isRequired`, `displayName`).
* `GET /v2/collections/{collection_id}/items` takes `limit` (max 100) and `offset` and returns `items[]` plus `pagination { limit, offset, total }`. Each item has `id`, `fieldData` (always `name` and `slug`), `isDraft`, `isArchived`, `lastPublished`, `lastUpdated`.
* `PATCH /v2/collections/{collection_id}/items/{item_id}` updates `fieldData`. `isDraft: false` queues an item to publish on the next site publish; it never unpublishes. Changing a slug breaks links to the old one. Needs the `CMS:write` scope.
* Rate limits are per API key: 60 requests per minute on Starter and Basic site plans, 120 on CMS, eCommerce and Business. A 429 carries `Retry-After`. Cached reads from `api-cdn.webflow.com` are effectively unlimited.

**Not verified:** the bulk-update endpoint and the publish endpoints were not read, so the client does not use them. The Image field's `alt` property (used by CM010) was not confirmed against the reference.

## Client-First

Source: [finsweet.com/client-first](https://finsweet.com/client-first/docs/intro) and the Client-First designer guide (mirrored on third-party sites).

* Custom classes contain `_`; utility classes use dashes only.
* Sections use a `section_` prefix and form folders.
* Combo classes use an `is-` prefix.
* Class names are lowercase; the guide advises against stacking more than four classes.

**Not verified:** a `u-` utility prefix, which I looked for and could not find in any source, so no rule depends on it.

## Finsweet Attributes (List Filter)

Source: [finsweet.com/attributes/list-filter](https://finsweet.com/attributes/list-filter) and the Finsweet forum.

* Required: `fs-list-element="list"` on the Collection List, `fs-list-element="filters"` on the filters form, matching `fs-list-field` on the inputs and inside each item, `fs-list-value` on checkbox and radio inputs.
* Optional: `clear`, `items-count`, `results-count`, the `tag*` family, `scroll-anchor`, `initial`.
* Forum threads: field names must match exactly; a field on the list's own element shadows the inner ones; v1 `fs-cmsfilter-*` attributes do nothing under v2.

**Not verified:** the value of the empty-state element (the page shows an apparent typo), and the exact v1 and v2 script URLs, which `finsweet.js` detects heuristically.

## GSAP in Webflow

Source: [gsap.com/docs/v3/GSAP/gsap.matchMedia()](https://gsap.com/docs/v3/GSAP/gsap.matchMedia/) plus Webflow forum threads.

* `gsap.matchMedia()` runs setup only while a query matches and reverts everything created inside it when it stops matching. It takes the same query strings as `window.matchMedia`, so breakpoints and `prefers-reduced-motion` combine in one place.
* Webflow Interactions (IX2) keep running next to custom GSAP. There is no official Webflow guidance on conflicts; the advice that exists is community workarounds that depend on Webflow internals (such as destroying IX2 for reduced motion). The audit therefore only notes the overlap (GS007) and the snippet does not touch IX2.

## Code export

Source: Webflow help center, "How do I export my Webflow site code?".

* The ZIP holds pages, styles, scripts and images. **CMS content, ecommerce data, forms and site search are not included**, so collection lists are empty in an export. That is why the Finsweet field cross-check needs saved pages from the published site, and why unused-class results are candidates only.
* Breakpoints: 991 / 767 / 478 (479 in some exports), plus 1280 / 1440 / 1920 cascading upward. Custom breakpoints are not supported.
* New images lazy-load by default; existing images are unchanged, and background images are never lazy-loaded.
