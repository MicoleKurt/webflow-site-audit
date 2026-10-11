/** Every audit returns plain findings so reports, JSON output and tests all see the same thing. */

export const SEVERITIES = ['error', 'warn', 'info'];

/**
 * @param {string} rule      stable id such as CF003; documented in docs/RULES.md
 * @param {'error'|'warn'|'info'} severity
 * @param {string} message   what is wrong, in one sentence
 * @param {{file?: string, detail?: string, fix?: string}} [extra]
 */
export function finding(rule, severity, message, extra = {}) {
  return { rule, severity, message, ...extra };
}

export function summarise(findings) {
  const counts = { error: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

/** True when the findings contain something at or above the threshold ('error' | 'warn' | 'none'). */
export function exceeds(findings, failOn) {
  if (failOn === 'none') return false;
  const counts = summarise(findings);
  return failOn === 'warn' ? counts.error + counts.warn > 0 : counts.error > 0;
}
