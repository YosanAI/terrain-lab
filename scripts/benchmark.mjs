/** CPU-only reference measurements: not a browser or GPU performance claim. */
import { performance } from 'node:perf_hooks';
import { GENERATORS, EROSIONS, defaultParameters } from '../src/ui/parameters.js';
import { generateTerrain, applyErosion } from '../src/algorithms/index.js';
import { cloneHeightmap, heightmapStatistics } from '../src/core/heightmap.js';
const segments = Number(process.argv[2] || 256);
if (![128, 256, 512].includes(segments)) throw new Error('Usage: npm run benchmark -- 128|256|512');
const results = [];
for (const [algorithm, definition] of Object.entries(GENERATORS)) {
  const started = performance.now();
  const { map } = generateTerrain(algorithm, { ...defaultParameters(definition), seed: 'terrain-42' }, { segments, size: 256 });
  results.push({ stage: 'generation', algorithm, elapsedMs: +(performance.now() - started).toFixed(2),
    samples: map.data.length, ...heightmapStatistics(map) });
}
const base = generateTerrain('fbm', { seed: 'terrain-42' }, { segments, size: 256 }).map;
for (const [algorithm, definition] of Object.entries(EROSIONS)) {
  const map = cloneHeightmap(base), started = performance.now();
  const { diagnostics } = applyErosion(algorithm, map, defaultParameters(definition));
  results.push({ stage: 'erosion', algorithm, elapsedMs: +(performance.now() - started).toFixed(2),
    samples: map.data.length, rmsChange: heightmapStatistics(map, base).rmsChange, diagnostics });
}
console.log(JSON.stringify({ runtime: process.version, platform: process.platform, architecture: process.arch,
  segments, note: 'One run per algorithm with shipped defaults; includes allocation; no GPU or UI timings.', results }, null, 2));
