// Minimal banned-pattern lint (ADR-001 section 5 "Static checks"; security-review-checklist A05/A04).
// Scans src/, scripts/ and tests/ for patterns that must not appear in app code.
// Allow-list: scripts/migrate.ts may use sql.unsafe (trusted, committed migration SQL only).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOTS = ['src', 'scripts', 'tests'];
const EXT = /\.(ts|tsx|js|mjs|cjs|astro)$/;
const SELF = join('scripts', 'lint.mjs');

const RULES = [
  { name: 'sql.unsafe (use tagged templates)', re: /\bsql\s*\.\s*unsafe\b|\btx\s*\.\s*unsafe\b/, allow: [join('scripts', 'migrate.ts')] },
  { name: 'set:html (XSS risk; escape instead)', re: /set:html/, allow: [] },
  { name: 'eval()', re: /(^|[^\w.$])eval\s*\(/, allow: [] },
  { name: 'new Function()', re: /\bnew\s+Function\s*\(/, allow: [] },
  { name: 'Astro.session (own DB-backed sessions only; ADR-001 D8)', re: /Astro\s*\.\s*session\b|\blocals\s*\.\s*session\b.*astro/i, allow: [] },
  { name: 'innerHTML assignment (use textContent)', re: /\.innerHTML\s*=/, allow: [] },
];

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    if (e === 'node_modules' || e === '.astro' || e === 'dist') continue;
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else if (EXT.test(e)) yield p;
  }
}

const hits = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const rel = relative('.', file).split(sep).join(sep);
    if (rel === SELF) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, ''); // ignore line comments
      for (const r of RULES) {
        if (r.re.test(code) && !r.allow.includes(rel)) hits.push(`${rel}:${i + 1}: banned ${r.name}`);
      }
    });
  }
}
if (hits.length) {
  console.error(hits.join('\n'));
  console.error(`\nlint failed: ${hits.length} banned pattern(s).`);
  process.exit(1);
}
console.log('lint ok: no banned patterns (sql.unsafe, set:html, eval, new Function, Astro.session, innerHTML=).');
