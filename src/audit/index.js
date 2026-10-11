import { auditClasses } from './classes.js';
import { auditFinsweet } from './finsweet.js';
import { auditGsap } from './gsap.js';
import { auditPerformance } from './performance.js';
import { auditResponsive } from './responsive.js';
import { auditSeo } from './seo.js';

export const AUDITS = {
  classes: auditClasses,
  responsive: auditResponsive,
  performance: auditPerformance,
  seo: auditSeo,
  finsweet: auditFinsweet,
  gsap: auditGsap,
};

/** Run the selected audits (all by default) and tag each finding with the audit that produced it. */
export function auditSite(site, only = Object.keys(AUDITS)) {
  const findings = [];
  for (const name of only) {
    if (!AUDITS[name]) throw new Error(`Unknown audit "${name}". Choose from: ${Object.keys(AUDITS).join(', ')}`);
    for (const f of AUDITS[name](site)) findings.push({ audit: name, ...f });
  }
  return findings;
}
