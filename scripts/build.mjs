import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const url = process.env.TIPI_SUPABASE_URL;
const key = process.env.TIPI_SUPABASE_PUBLISHABLE_KEY;
if (!url || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !key?.startsWith('sb_publishable_')) {
  throw new Error('Set TIPI_SUPABASE_URL and TIPI_SUPABASE_PUBLISHABLE_KEY before building.');
}

await mkdir('dist', { recursive: true });
for (const file of ['app.js','ui.js','dropdowns.js','styles.css','tipi-theme.css','cloud.css']) {
  await copyFile(file, 'dist/'+file);
}
const html = await readFile('index.html', 'utf8');
await writeFile('dist/index.html', html
  .replace('<html lang="vi">', '<html lang="vi" data-cloud>')
  .replace('</head>', '<link rel="stylesheet" href="cloud.css"></head>')
  .replace('<body>', '<body><section id="cloudGate" class="cloud-gate"><div class="panel cloud-card"><h1>Tipi</h1><p role="status">Đang mở Tipi…</p></div></section>')
  .replace('</body>', '<script type="module" src="cloud.js"></script></body>'));

await build({
  entryPoints: ['cloud.js'],
  outfile: 'dist/cloud.js',
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2022', 'safari16'],
  define: {
    TIPI_SUPABASE_URL: JSON.stringify(url),
    TIPI_SUPABASE_PUBLISHABLE_KEY: JSON.stringify(key)
  }
});
