# webflow-site-audit

Audit an existing Webflow site the way a maintainer inherits it: **class system, responsive CSS, page speed, SEO, Finsweet Attributes and GSAP code**, plus the **CMS content** through the Data API v2. It finds problems and says how to fix them; it does not rewrite your site.

> **Author:** Micole Kurt T. Gonda ([@MicoleKurt](https://github.com/MicoleKurt)) · MIT licensed

## Why this exists

Work on live Webflow projects is mostly inheritance: someone else's class names, a CMS with half-filled fields, a Finsweet filter that silently stopped working, GSAP running next to Webflow Interactions, a mobile layout that overflows. Each of those has a cause you can check mechanically. This tool turns those checks into one command with stable rule ids ([docs/RULES.md](docs/RULES.md)) and a stated source for every rule ([docs/RESEARCH.md](docs/RESEARCH.md)).

## Use it

```bash
npm install
node src/cli.js audit path/to/webflow-export          # or: npx wfa audit ...
node src/cli.js audit examples/sample-export          # a small site with deliberate problems
```

`<dir>` is an unzipped Webflow **code export** (Main menu > Code export), or pages saved from the published site. Options: `--only classes,responsive,performance,seo,finsweet,gsap`, `--format text|md|json`, `--fail-on error|warn|none` (exit code 1 when the threshold is met, so it can gate CI).

```
ERROR CF004  Combo class used on its own, with no base class: is-featured  [index.html]
        fix: An is- class only modifies a base class (button is-secondary). ...
WARN  RS003  1 selector(s) set a fixed width of 600px or more with no override at 767px or below: .div-block-12 (900px)
WARN  GS009  ScrollTrigger markers: true is still enabled
...
3 error(s), 19 warning(s), 5 note(s)
```

### CMS content

```bash
export WEBFLOW_TOKEN=...        # site token: cms:read (plus cms:write for backfill --apply)
node src/cli.js cms audit --site <site_id>
node src/cli.js cms backfill --collection <id> --from summary --to meta-description            # dry run
node src/cli.js cms backfill --collection <id> --from summary --to meta-description --apply
```

The audit checks required fields, duplicate and malformed slugs, empty and mis-sized meta descriptions, images without alt text, drafts and unpublished edits. Backfill fills an **empty** field from another one. It plans first, writes only with `--apply`, **never touches `slug` or `name`** (changing them breaks live URLs), and sends only `fieldData`, so edits stay drafts until you publish.

The client follows the documented limits: 100 items per page with `offset`, and on HTTP 429 it waits for `Retry-After` and retries. The token is never put into an error message.

## What it checks

| Audit | Looks for |
|---|---|
| `classes` | Client-First conventions: lowercase, `section_` on sections, `is-` combos with a base class, stacks of more than four, leftover `div-block-12` names, unused CSS candidates |
| `responsive` | Missing viewport meta, breakpoints outside Webflow's set, large fixed widths with no mobile override, `100vw`, `100vh`, `overflow-x: hidden` on the body |
| `performance` | Images without dimensions or alt, a lazy-loaded hero, render-blocking head scripts, `@font-face` without `font-display`, `@import`, heavy images |
| `seo` | Title, description, one `h1`, heading order, `lang`, canonical, Open Graph, unnamed links, duplicate titles |
| `finsweet` | v1 vs v2 markup, filter fields that do not match the list's fields (case-sensitive), filters with no list, `fs-list-field` on the list element |
| `gsap` | `ScrollTrigger` not registered, no `gsap.matchMedia()`, no reduced-motion handling, `markers: true`, `window.onload =`, layout-property tweens, duplicate loads |

## A GSAP base you can paste in

[`snippets/webflow-gsap-base.js`](snippets/webflow-gsap-base.js) and [`snippets/head.html`](snippets/head.html): attribute-driven scroll reveals (`data-anim="fade-up | fade | scale | stagger"`) that use `gsap.matchMedia()` so reduced motion shows everything with no animation, register ScrollTrigger once, wait for `Webflow.push`, refresh after fonts load, and never leave content hidden if GSAP fails to load (a 3 second failsafe in the head). The test suite runs the snippet in a DOM and also runs the `gsap` audit against it, which must come back with no errors or warnings.

## Tests

```bash
npm test      # 43 tests: every rule, the CMS client against a scripted fetch, the CLI, the snippet in jsdom
```

## Status and limits (read this)

* The rules come from documentation and forum reports (see [docs/RESEARCH.md](docs/RESEARCH.md)); each rule in [docs/RULES.md](docs/RULES.md) is marked *documented*, *community* or *heuristic*. GSAP and responsive checks are static heuristics and can be wrong.
* It has **not been run against a real Webflow export or a live Webflow site**; the tests use fixtures I wrote. The CMS client has only been exercised against a mocked `fetch`, never the live API, so treat the first real call as a test.
* A code export contains no CMS items, so the Finsweet field cross-check needs pages saved from the published site; on an export it reports that it cannot verify.
* Some details were not confirmed against the docs and are listed in the research notes (the Image field's `alt` property, the Finsweet script URLs, the empty-state attribute value).
* Not included: bulk updates, publishing, the Designer API, and any change to styles or classes in the Designer (the Data API does not expose them).

## License

MIT, © 2026 Micole Kurt T. Gonda
