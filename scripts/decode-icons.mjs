// Decodes base64-encoded PWA icons into public/icons/ before the build.
// The icons are stored as .b64 text because binary files cannot be added
// through the GitHub web editor.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, 'icons-b64');
const outDir = join(here, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });
for (const file of readdirSync(srcDir)) {
  if (!file.endsWith('.b64')) continue;
  const png = file.slice(0, -4);
  const data = Buffer.from(readFileSync(join(srcDir, file), 'utf8').trim(), 'base64');
  writeFileSync(join(outDir, png), data);
  console.log(`decoded ${png} (${data.length} bytes)`);
}
