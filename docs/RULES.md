# Rules

Every finding has a stable id. **Basis** says where the rule comes from, because an audit is only as trustworthy as its reasons:

* **Documented**: stated in Webflow, Finsweet or GSAP documentation.
* **Community**: recurring failure reported on the Finsweet or Webflow forums, not stated as a rule in the docs.
* **Heuristic**: a reasonable static check that can be wrong; the message says what was seen, not what is certainly broken.

## Class system (`classes`), following Client-First

| Id | Severity | What it flags | Basis |
|---|---|---|---|
| CF001 | warn | Class names with uppercase letters | Documented: Client-First class names are lowercase |
| CF002 | warn | `<section>` without a `section_` class | Documented: sections start with `section_` and form folders |
| CF003 | warn | More than 4 classes stacked on one element | Documented guidance (Client-First designer guide) |
| CF004 | error | An `is-` combo class with no base class | Documented: combo classes modify a base class |
| CF005 | info | Classes in CSS never used in any page | Heuristic: a code export omits CMS-bound markup and script-added classes, so this lists candidates only |
| CF006 | warn | Auto-generated names (`div-block-12`, `heading-3`, ...) still in use | Heuristic on Webflow's default naming |

## Responsive (`responsive`)

Webflow's breakpoints are fixed: 991px (tablet), 767px (mobile landscape), 478px (mobile portrait; exports sometimes show 479px), plus 1280, 1440 and 1920px that cascade upward.

| Id | Severity | What it flags | Basis |
|---|---|---|---|
| RS000 | warn | CSS that could not be parsed | n/a |
| RS001 | error | No viewport meta tag | Documented web platform behaviour |
| RS002 | warn | A media query outside Webflow's breakpoint set | Community: Webflow has no custom breakpoints, so hand-edited values are lost on re-export |
| RS003 | warn | Fixed `width` of 600px or more with no override at 767px or below | Heuristic |
| RS004 | warn | `100vw` widths (include the scrollbar, cause horizontal scroll) | Documented web platform behaviour |
| RS005 | info | `overflow-x: hidden` on `html`/`body` | Heuristic: often masks an overflow bug |
| RS006 | info | `100vh` (ignores the mobile browser toolbar) | Heuristic; fix is a `100dvh` declaration after it |

## Performance (`performance`)

| Id | Severity | What it flags | Basis |
|---|---|---|---|
| PF001 | warn | `<img>` without `width` and `height` | Documented (layout shift) |
| PF002 | error | `<img>` with no `alt` attribute | Documented (accessibility) |
| PF003 | warn | First image on the page is lazy-loaded | Community guidance: do not lazy-load the LCP image |
| PF004 | info | Later images with no `loading` attribute | Heuristic (Webflow lazy-loads new images by default; older ones are not changed) |
| PF005 | warn | `<script src>` in `<head>` without `async`/`defer`/`module` | Documented (render-blocking) |
| PF006 | warn | `@font-face` without `font-display` | Documented |
| PF007 | warn / error | Image of 200 KB or more / 500 KB or more | Heuristic thresholds |
| PF008 | info | More than 8 external scripts on a page | Heuristic |
| PF009 | warn | CSS `@import` | Documented (serial, blocking) |
| PF010 | info | JPG/PNG over 100 KB where WebP/AVIF would be smaller | Heuristic |

## SEO and accessibility (`seo`)

| Id | Severity | What it flags |
|---|---|---|
| SE001 | error | Missing or empty `<title>` |
| SE002 | warn | Title over 60 characters |
| SE003 | warn / info | Missing meta description / length outside 50 to 160 |
| SE004 | error / warn | No `<h1>` / more than one |
| SE005 | warn | Heading level skipped |
| SE006 | warn | Missing `lang` on `<html>` |
| SE007 | info | No canonical link |
| SE008 | info | Open Graph title or image missing |
| SE009 | warn | Link with no accessible name |
| SE010 | warn | Duplicate title across pages |
| SE011 | info | `noindex` |

## Finsweet Attributes, list filtering (`finsweet`)

| Id | Severity | What it flags | Basis |
|---|---|---|---|
| FS001 | error / info | v1 markup (`fs-cmsfilter-*` and siblings) under the v2 script / under the v1 script | Community: v1 attributes do nothing in v2 |
| FS002 | error / info | A filter's `fs-list-field` has no matching field in the list items (case-sensitive; names the near match). Info when the page has no list fields to compare, as in a code export | Documented: field names must match; Community for the case-sensitivity reports |
| FS003 | error | Filters form with no list on the page | Documented: both are required |
| FS004 | warn | `fs-list-field` on the same element as `fs-list-element="list"` | Community: reported to shadow inner fields |
| FS005 | warn | `fs-list-value` on something that is not a checkbox or radio | Documented for checkbox and radio inputs |
| FS006 | warn / info | `fs-` attributes with no Attributes script / script with no attributes | Heuristic script detection |
| FS007 | info | `fs-list-element` value not in the documented set | Documented set; the page itself has an apparent typo for the empty-state value, so this is only a note |
| FS008 | warn | `fs-list-field` names differing only by case | Community |

## GSAP (`gsap`)

Static checks on inline scripts and project JS files (Webflow's own and vendored library files are skipped).

| Id | Severity | What it flags | Basis |
|---|---|---|---|
| GS001 | error | ScrollTrigger used, `registerPlugin(ScrollTrigger)` not found | Documented |
| GS002 | warn | ScrollTrigger without `gsap.matchMedia()` or `gsap.context()` | Documented pattern for cleanup and per-breakpoint setup |
| GS003 | warn | No `prefers-reduced-motion` handling | Documented pattern (`matchMedia` with a reduced-motion condition) |
| GS004 | info | Tweens animating `width`, `height`, `top`, `left`, margin or padding | Heuristic (reflow every frame) |
| GS005 | warn | `window.onload =` assignment | Documented web platform behaviour |
| GS006 | warn | GSAP core loaded more than once on a page | Heuristic |
| GS007 | info | Webflow Interactions (`data-w-id`) and GSAP on the same page | Community: Webflow publishes no official guidance on conflicts |
| GS008 | warn | Tweens created with no DOM-ready wrapper | Heuristic |
| GS009 | warn | `markers: true` left on | Documented option |

## CMS content (`wfa cms audit`)

| Id | Severity | What it flags |
|---|---|---|
| CM001 | error | Required field empty |
| CM002 | warn / info | Duplicate slug / duplicate name |
| CM003 | warn | Slug not lowercase kebab-case (changing a slug breaks live links) |
| CM004 | warn | Empty meta-description field |
| CM005 | info | Meta description outside 50 to 160 characters |
| CM006 | info | Draft items |
| CM007 | info | Published items with edits newer than the last publish |
| CM008 | info | Archived items |
| CM009 | info | Item name over 70 characters |
| CM010 | warn | Image field with a file but no alt text (assumes the Image field value carries `alt`) |
