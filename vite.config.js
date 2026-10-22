import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { zipSync } from 'fflate';

/* After every production build, packs the contents of dist/ into dist/<name>-<version>.zip (ready to upload). */
function zipDist() {
  let outDir = 'dist';
  return {
    name: 'zip-dist',
    apply: 'build',
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir); },
    closeBundle() {
      const { name, version } = JSON.parse(fs.readFileSync(path.resolve(outDir, '..', 'package.json'), 'utf8'));
      const zipName = `${name}-${version}.zip`, files = {};
      (function walk(dir, rel) {
        for (const f of fs.readdirSync(dir)) {
          const abs = path.join(dir, f), r = rel ? rel + '/' + f : f;
          if (fs.statSync(abs).isDirectory()) walk(abs, r);
          else if (!f.endsWith('.zip')) files[r] = fs.readFileSync(abs);
        }
      })(outDir, '');
      const zip = zipSync(files, { level: 9 });
      fs.writeFileSync(path.join(outDir, zipName), zip);
      console.log(`\n  zip: dist/${zipName} (${(zip.length / 1024).toFixed(0)} kB, ${Object.keys(files).length} files)`);
    },
  };
}

export default defineConfig({
  base: './',
  server: { host: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  plugins: [zipDist()],
});
