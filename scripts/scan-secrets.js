#!/usr/bin/env node
/**
 * Scans project source for likely hardcoded secrets (excludes node_modules).
 */
import { readdir, readFile } from 'fs/promises';
import path from 'path';

const ROOT = path.resolve('.');
const SKIP = new Set(['node_modules', '.git', 'database/career_engine.db']);
const PATTERNS = [
  { name: 'AWS key', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'GitHub PAT', re: /ghp_[a-zA-Z0-9]{20,}/ },
  { name: 'Generic API key assignment', re: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]{8,}['"]/i },
  { name: 'Password assignment', re: /password\s*[:=]\s*['"][^'"]{4,}['"]/i },
  { name: 'Bearer token assignment', re: /bearer\s+[a-zA-Z0-9._-]{20,}/i },
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
];

async function walk(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const rel = path.relative(ROOT, path.join(dir, e.name));
    if ([...SKIP].some((s) => rel.startsWith(s))) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, files);
    else if (/\.(js|json|html|env|md|yml|yaml)$/.test(e.name) && !e.name.endsWith('.example')) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  const files = await walk(ROOT);
  const hits = [];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/process\.env\./.test(line)) continue;
      if (/\.env\.example/.test(file)) continue;
      for (const p of PATTERNS) {
        if (p.re.test(line)) {
          hits.push({ file: path.relative(ROOT, file), line: i + 1, type: p.name, snippet: line.trim().slice(0, 80) });
        }
      }
    }
  }
  if (!hits.length) {
    console.log('✅ No hardcoded secrets detected in project source.');
    process.exit(0);
  }
  console.log(`⚠️  ${hits.length} potential secret(s):`);
  for (const h of hits) console.log(`  ${h.file}:${h.line} [${h.type}] ${h.snippet}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
