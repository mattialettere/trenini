// Scarica i GLB Polyfork elencati in scripts/models.json in public/models/
// e scrive src/assets/credits.json (riga di credito CC BY 4.0, misure, origine).
// Uso: node scripts/fetch-models.mjs
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';

const ids = JSON.parse(await readFile(new URL('./models.json', import.meta.url), 'utf8'));
await mkdir('public/models', { recursive: true });
await mkdir('src/assets', { recursive: true });
const credits = [];
for (const id of ids) {
  const meta = await (await fetch(`https://polyfork.dev/api/assets/${id}`)).json();
  if (!meta.credit) throw new Error(`nessuna riga di credito per ${id}`);
  const file = `public/models/${id}.glb`;
  const exists = await access(file).then(() => true, () => false);
  if (!exists) {
    const res = await fetch(meta.download.glb);
    if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
  }
  credits.push({ id, title: meta.title, kit: meta.kit, credit: meta.credit, size: meta.size_m, origin: meta.origin ?? null, triangles: meta.triangles });
  console.log('ok', id);
}
await writeFile('src/assets/credits.json', JSON.stringify(credits, null, 2) + '\n');
