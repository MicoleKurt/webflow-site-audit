import { summarise } from './findings.js';

const ORDER = { error: 0, warn: 1, info: 2 };
const sorted = (findings) => [...findings].sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.rule.localeCompare(b.rule));

export function formatText(findings) {
  const lines = [];
  for (const f of sorted(findings)) {
    lines.push(`${f.severity.toUpperCase().padEnd(5)} ${f.rule}  ${f.message}${f.file ? `  [${f.file}]` : ''}`);
    if (f.fix) lines.push(`        fix: ${f.fix}`);
    if (f.detail) lines.push(`        note: ${f.detail}`);
  }
  const c = summarise(findings);
  lines.push('', `${c.error} error(s), ${c.warn} warning(s), ${c.info} note(s)`);
  return lines.join('\n');
}

export function formatMarkdown(findings, title = 'Webflow site audit') {
  const c = summarise(findings);
  const out = [`# ${title}`, '', `**${c.error}** errors, **${c.warn}** warnings, **${c.info}** notes`, ''];
  for (const severity of ['error', 'warn', 'info']) {
    const group = sorted(findings).filter((f) => f.severity === severity);
    if (!group.length) continue;
    out.push(`## ${{ error: 'Errors', warn: 'Warnings', info: 'Notes' }[severity]}`, '');
    for (const f of group) {
      out.push(`- **${f.rule}** ${f.message}${f.file ? ` (\`${f.file}\`)` : ''}`);
      if (f.fix) out.push(`  - Fix: ${f.fix}`);
      if (f.detail) out.push(`  - Note: ${f.detail}`);
    }
    out.push('');
  }
  return out.join('\n');
}

export const formatJson = (findings) => JSON.stringify({ summary: summarise(findings), findings: sorted(findings) }, null, 2);
