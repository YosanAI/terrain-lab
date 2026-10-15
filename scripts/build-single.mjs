import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerEntry = resolve(root, 'src/workers/terrain.worker.js');
const workerBuild = await build({ entryPoints: [workerEntry], bundle: true, format: 'iife',
  target: 'es2022', minify: true, write: false, legalComments: 'inline' });
const workerCode = workerBuild.outputFiles[0].text;

const result = await build({
  entryPoints: [resolve(root, 'src/main.js')], bundle: true, format: 'iife', target: 'es2022',
  minify: true, write: false, legalComments: 'inline', outdir: resolve(root, 'standalone'),
  plugins: [{
    name: 'embedded-terrain-worker',
    setup(builder) {
      builder.onResolve({ filter: /\?worker&inline$/ }, () => ({ path: 'terrain-worker', namespace: 'embedded-worker' }));
      builder.onLoad({ filter: /.*/, namespace: 'embedded-worker' }, () => ({
        contents: `export default class TerrainWorker extends Worker {
          constructor() {
            const url = URL.createObjectURL(new Blob([${JSON.stringify(workerCode)}], {type:'text/javascript'}));
            super(url);
            // The browser captures the Blob when constructing the worker.
            setTimeout(() => URL.revokeObjectURL(url), 10000);
          }
        }`, loader: 'js',
      }));
    },
  }],
});
const js = result.outputFiles.find((file) => file.path.endsWith('.js')).text;
const css = result.outputFiles.find((file) => file.path.endsWith('.css')).text;
const license = await readFile(resolve(root, 'node_modules/three/LICENSE'), 'utf8');
let html = await readFile(resolve(root, 'index.html'), 'utf8');
html = html.replace('</head>', `<style>${css}</style>\n</head>`)
  .replace('<script type="module" src="/src/main.js"></script>',
    `<!-- Three.js and OrbitControls are bundled locally. No network access is needed. -->\n<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`)
  .replace('</body>', `<!--\nThird-party license: Three.js / OrbitControls\n${license.replace(/-->/g, '-- >')}\n-->\n</body>`);
await mkdir(resolve(root, 'standalone'), { recursive: true });
await writeFile(resolve(root, 'standalone/terrain-laboratory.html'), html);
console.log(`Created standalone/terrain-laboratory.html (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB, self-contained).`);
