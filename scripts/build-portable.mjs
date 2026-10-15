/**
 * Dependency-free packaging of our own ES modules, for a small single-HTML
 * edition. The browser's native module loader links embedded Blob modules.
 * Three.js / OrbitControls load from a pinned CDN in this edition only.
 * For a fully offline HTML with Three.js embedded, use npm run build:single.
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sources = {};
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (entry.name.endsWith('.js')) sources[relative(root, path).replaceAll('\\', '/')] = await readFile(path, 'utf8');
  }
}
await collect(resolve(root, 'src'));
const css = await readFile(resolve(root, 'src/style.css'), 'utf8');
const imports = {
  three: 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js',
  'three/addons/controls/OrbitControls.js': 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js',
};

// The worker must be self-contained: module-worker imports between Blob URLs
// can fail on opaque file:// origins. This small linker supports only the named
// static imports/exports used by our pure algorithm modules (not arbitrary JS).
function bundleClassicWorker(entry) {
  const modules = new Map();
  function visit(id) {
    if (modules.has(id)) return;
    let code = sources[id];
    if (code === undefined) throw new Error(`Missing worker module ${id}`);
    const exportNames = [...code.matchAll(/^export\s+(?:function|class|const|let)\s+(\w+)/gm)].map((match) => match[1]);
    code = code.replace(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm,
      (_, bindings, specifier) => {
        const target = relative(root, resolve(root, dirname(id), specifier)).replaceAll('\\', '/');
        visit(target);
        return `const {${bindings}} = require(${JSON.stringify(target)});`;
      });
    code = code.replace(/^export\s+(?=(function|class|const|let)\s)/gm, '');
    code += '\n' + exportNames.map((name) => `exports.${name} = ${name};`).join('\n');
    modules.set(id, code);
  }
  visit(entry);
  const factories = [...modules].map(([id, code]) => `${JSON.stringify(id)}: function(exports, require) {\n${code}\n}`).join(',\n');
  return `(() => {\nconst modules = {${factories}};\nconst cache = {};\nfunction require(id) {
    if (cache[id]) return cache[id];
    const exports = {}; cache[id] = exports; modules[id](exports, require); return exports;
  }\nrequire(${JSON.stringify(entry)});\n})();`;
}
const workerCode = bundleClassicWorker('src/workers/terrain.worker.js');

function bootEmbeddedModules(sources, externals, embeddedWorkerCode) {
  const urls = new Map();
  function resolvePath(parent, specifier) {
    const parts = parent.split('/'); parts.pop();
    for (const part of specifier.split('/')) {
      if (part === '..') parts.pop(); else if (part !== '.' && part !== '') parts.push(part);
    }
    return parts.join('/');
  }
  function moduleURL(id) {
    if (urls.has(id)) return urls.get(id);
    let source = sources[id];
    if (source === undefined) throw new Error(`Missing embedded module: ${id}`);
    function dependency(specifier) {
      if (externals[specifier]) return externals[specifier];
      if (specifier.endsWith('?worker&inline')) {
        const workerFactory = `export default class TerrainWorker extends Worker {
          constructor() {
            const url = URL.createObjectURL(new Blob([${JSON.stringify(embeddedWorkerCode)}], { type: 'text/javascript' }));
            super(url);
            setTimeout(() => URL.revokeObjectURL(url), 10000);
          }
        }`;
        return URL.createObjectURL(new Blob([workerFactory], { type: 'text/javascript' }));
      }
      return moduleURL(resolvePath(id, specifier));
    }
    source = source.replace(/^import\s+['"][^'"]+\.css['"];?\s*$/gm, '');
    source = source.replace(/(\bfrom\s*['"])([^'"]+)(['"])/g,
      (_, before, specifier, after) => before + dependency(specifier) + after);
    source = source.replace(/(\bimport\s*\(\s*['"])([^'"]+)(['"]\s*\))/g,
      (_, before, specifier, after) => before + dependency(specifier) + after);
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    urls.set(id, url);
    return url;
  }
  import(moduleURL('src/main.js')).catch((error) => {
    const status = document.getElementById('status');
    status.textContent = `Application error: ${error.message}`; status.classList.add('error');
  });
}
let html = await readFile(resolve(root, 'index.html'), 'utf8');
const boot = `(${bootEmbeddedModules.toString()})(${JSON.stringify(sources)},${JSON.stringify(imports)},${JSON.stringify(workerCode)});`;
html = html.replace('</head>', `<style>${css}</style>\n<script type="importmap">${JSON.stringify({ imports })}</script>\n</head>`)
  .replace('<script type="module" src="/src/main.js"></script>',
    `<script>${boot.replace(/<\/script/gi, '<\\/script')}</script>`);
await mkdir(resolve(root, 'portable'), { recursive: true });
await writeFile(resolve(root, 'portable/terrain-laboratory.html'), html);
console.log(`Created portable/terrain-laboratory.html (${Math.round(Buffer.byteLength(html) / 1024)} KB). Three.js loads from the CDN; all other code is embedded.`);
