import { generateTerrain, applyErosion } from '../algorithms/index.js';

self.addEventListener('message', (event) => {
  const { id, action, algorithm, parameters, settings, heightmap } = event.data;
  let lastProgressTime = 0;
  const started = performance.now();
  const progress = (fraction) => {
    const now = performance.now();
    if (now - lastProgressTime < 80 && fraction !== 1) return;
    lastProgressTime = now;
    self.postMessage({ id, type: 'progress', fraction });
  };
  try {
    let result;
    if (action === 'generate') result = generateTerrain(algorithm, parameters, settings, progress);
    else if (action === 'erode') result = applyErosion(algorithm, heightmap, parameters, progress);
    else throw new Error(`Unknown worker action: ${action}`);
    result.elapsedMs = performance.now() - started;
    self.postMessage({ id, type: 'result', ...result }, [result.map.data.buffer]);
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error.message });
  }
});
