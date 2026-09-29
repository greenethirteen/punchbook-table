// Stamps every ?v= asset token in public/**/*.html with that file's content hash,
// so a changed asset always gets a new URL. Run: npm run cachebust
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const ROOT = path.join(process.cwd(), 'public');
const hashes = new Map();

function hash(assetPath) {
  if (!hashes.has(assetPath)) {
    const file = path.join(ROOT, assetPath);
    hashes.set(assetPath, fs.existsSync(file)
      ? crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex').slice(0, 12)
      : null);
  }
  return hashes.get(assetPath);
}

function htmlFiles(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? htmlFiles(full) : entry.name.endsWith('.html') ? [full] : [];
  });
}

let changed = 0, missing = [];
for (const file of htmlFiles(ROOT)) {
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(/(href|src)="\/([^"?]+\.(?:css|js))(?:\?v=[^"]*)?"/g, (whole, attr, asset) => {
    const v = hash(asset);
    if (!v) { missing.push(`${path.relative(ROOT, file)} -> /${asset}`); return whole; }
    return `${attr}="/${asset}?v=${v}"`;
  });
  if (after !== before) {
    fs.writeFileSync(file, after);
    console.log(`stamped ${path.relative(ROOT, file)}`);
    changed++;
  }
}

for (const [asset, v] of [...hashes].filter(([, v]) => v).sort()) console.log(`  /${asset} -> ?v=${v}`);
if (missing.length) { console.error('\nReferenced but not found:'); for (const m of missing) console.error('  ' + m); }
console.log(`\n${changed} file(s) updated.`);
process.exit(missing.length ? 1 : 0);
