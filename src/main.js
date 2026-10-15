import './style.css';
import { TerrainStore } from './core/terrain-store.js';
import { cloneHeightmap, heightmapStatistics } from './core/heightmap.js';
import { WorkerClient } from './workers/worker-client.js';
import { createViewport } from './view/create-viewport.js';
import { FAMILIES, GENERATORS, EROSIONS, defaultParameters } from './ui/parameters.js';
import { createParameterControls } from './ui/parameter-controls.js';
import { initializeAccordions } from './ui/accordions.js';
import { createGenerationSeed } from './ui/generation-seed.js';
import { LiveGeneration } from './ui/live-generation.js';

const element = (id) => document.getElementById(id);
const format = (value, digits = 2) => Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
const store = new TerrainStore(20);
const worker = new WorkerClient();
const cache = Object.fromEntries(Object.entries(GENERATORS).map(([id, definition]) => [id, defaultParameters(definition)]));
const erosionControls = {};
let baseControls = null;
let viewport = null;
let busy = false;
let eroding = false;
let started = 0;
const generation = new LiveGeneration({
  run: (job, report) => worker.run(job, report),
  cancel: () => worker.cancel(),
  onStateChange: () => updateButtons(),
  onStart: (job) => {
    started = performance.now();
    element('progress').value = 0;
    setStatus(`Generating ${GENERATORS[job.algorithm].label}…`);
  },
  onProgress: (fraction, job) => progress(`Generating ${GENERATORS[job.algorithm].label}`, fraction),
  onResult: (result, job, options) => {
    const resized = !store.currentHeightmap || store.currentHeightmap.size !== result.map.size;
    store.generate(result.map, { algorithm: job.algorithm, parameters: result.parameters, settings: job.settings });
    element('show-base').checked = false;
    // A live edit should not reset an orbit/pan/zoom the user has chosen.
    refreshViewport({ newBase: true, frame: options.frame || resized });
    setStatus(`${options.live ? 'Updated' : 'Generated'} ${GENERATORS[job.algorithm].label} · ${format(result.elapsedMs / 1000, 3)} s. Ready to apply erosion.`);
  },
  onError: (error) => setStatus(error.message, error.name !== 'AbortError'),
});

function setStatus(message, error = false) {
  element('status').textContent = message;
  element('status').classList.toggle('error', error);
}

function updateButtons() {
  busy = eroding || generation.busy;
  const ready = !!store.currentHeightmap;
  // Leave base controls usable during generation so newer edits can replace it.
  element('base-controls').disabled = eroding;
  element('erosion-controls').disabled = busy || !ready;
  element('undo').disabled = busy || !store.history.length;
  element('reset').disabled = busy || !ready;
  element('export-json').disabled = busy || !ready;
  element('export-png').disabled = busy || !ready;
  element('show-base').disabled = !ready;
  element('frame-view').disabled = !ready;
  element('cancel').hidden = !busy;
  element('progress').hidden = !busy;
  element('viewport').setAttribute('aria-busy', String(busy));
  element('erosion-history').hidden = !store.operationLog.length;
}


function progress(label, fraction) {
  element('progress').value = fraction;
  setStatus(`${label} · ${Math.round(fraction * 100)}% · ${((performance.now() - started) / 1000).toFixed(1)} s`);
}

function populateAlgorithmControls() {
  const algorithm = element('algorithm').value;
  const definition = GENERATORS[algorithm];
  element('algorithm-description').textContent = definition.description;
  baseControls = createParameterControls(element('base-parameters'), definition, cache[algorithm],
    (values) => { cache[algorithm] = values; requestGeneration(); });
}

function populateAlgorithms(preferred = null) {
  const family = FAMILIES.find((item) => item.id === element('family').value);
  element('algorithm').replaceChildren(...family.algorithms.map((id) => new Option(GENERATORS[id].label, id)));
  if (preferred && family.algorithms.includes(preferred)) element('algorithm').value = preferred;
  populateAlgorithmControls();
}

function updateLabels() {
  if (!store.currentHeightmap) return;
  const showingBase = element('show-base').checked;
  const displayed = showingBase ? store.baseHeightmap : store.currentHeightmap;
  const stats = heightmapStatistics(displayed, store.baseHeightmap);
  const values = [
    `${displayed.width} × ${displayed.height} samples`,
    `Size ${format(displayed.size, 0)} · spacing ${format(displayed.cellSize, 3)}`,
    `Height ${format(stats.minimum)} … ${format(stats.maximum)}`,
    `Mean ${format(stats.mean)}`, `RMS Δ from base ${format(stats.rmsChange, 4)}`,
  ];
  element('statistics').replaceChildren(...values.map((text) => {
    const span = document.createElement('span'); span.textContent = text; return span;
  }));
  element('current-label').textContent = `${GENERATORS[store.baseRecipe.algorithm].label} · seed ${store.baseRecipe.parameters.seed}`
    + (showingBase ? ' · BASE' : ` · ${store.operationLog.length} erosion operation${store.operationLog.length === 1 ? '' : 's'}`);
  const mode = element('view-mode').value;
  element('legend').textContent = mode === 'difference'
    ? `Blue = eroded · Red = deposited · Δ range ±${format(viewport.differenceRange || 0, 4)} world units`
    : `Fixed base color range: ${format(viewport.baseRange.minimum)} to ${format(viewport.baseRange.maximum)}`;
  element('interaction-hint').hidden = mode === 'heightmap';
  element('history-status').textContent = `${store.operationLog.length} applied · ${store.history.length}/20 undo snapshots. Reset clears erosion history.`;
  const log = store.operationLog.map((operation, index) => {
    const d = operation.diagnostics;
    const lines = [`${index + 1}. ${EROSIONS[operation.algorithm].label} · ${format(operation.elapsedMs / 1000, 3)} s`];
    if (d.exportedSediment !== undefined) lines.push(`   Sediment exported: ${format(d.exportedSediment, 5)}`);
    if (d.totalEroded !== undefined) lines.push(`   Eroded / deposited: ${format(d.totalEroded, 3)} / ${format(d.totalDeposited, 3)}`);
    if (d.totalTransferred !== undefined) lines.push(`   Material transferred: ${format(d.totalTransferred, 3)}`);
    lines.push(`   Solid balance error: ${Number(d.massError).toExponential(3)} (sum of sample heights)`);
    if (d.conductanceLimited) lines.push(`   Flow conductance limited to ${d.conductance} for stability.`);
    return lines.join('\n');
  }).join('\n\n');
  element('operation-log').textContent = log || 'No erosion applied.';
  updateButtons();
}

function refreshViewport(options = {}) {
  if (!store.currentHeightmap || !viewport) return;
  const map = element('show-base').checked ? store.baseHeightmap : store.currentHeightmap;
  viewport.update(map, store.baseHeightmap, options);
  updateLabels();
}

/** Capture a complete recipe before scheduling; only valid edits reach the worker. */
function requestGeneration({ freshSeed = false, immediate = false, frame = false } = {}) {
  if (eroding || !viewport) return;
  try {
    const sizeInput = element('terrain-size');
    if (!sizeInput.checkValidity()) throw new RangeError('Terrain size must be a whole number from 64 to 2048.');
    const algorithm = element('algorithm').value;
    const parameters = baseControls.getValues({ report: immediate });
    if (freshSeed) element('base-seed').value = createGenerationSeed(element('base-seed').value);
    parameters.seed = element('base-seed').value;
    const settings = { segments: Number(element('segments').value), size: Number(sizeInput.value) };
    setStatus(immediate ? 'Generating new terrain…' : 'Updating terrain…');
    generation.request({ action: 'generate', algorithm, parameters, settings },
      { immediate, frame, live: !freshSeed });
  } catch (error) {
    generation.cancel();
    setStatus(`${error.message} Keeping the current terrain.`, immediate);
  }
}

async function erode(algorithm) {
  if (busy || !store.currentHeightmap) return;
  try {
    const parameters = erosionControls[algorithm].getValues();
    started = performance.now(); eroding = true; element('progress').value = 0; updateButtons();
    const label = `Running ${EROSIONS[algorithm].label}`;
    setStatus(`${label}…`);
    // Transfer a COPY. Neither the saved base nor the visible current map is detached.
    const result = await worker.run({ action: 'erode', algorithm, parameters,
      heightmap: cloneHeightmap(store.currentHeightmap) }, (fraction) => progress(label, fraction));
    store.commitErosion(result.map, { algorithm, parameters: result.parameters,
      diagnostics: result.diagnostics, elapsedMs: result.elapsedMs });
    element('show-base').checked = false;
    refreshViewport();
    let message = `Applied ${EROSIONS[algorithm].label} · ${format(result.elapsedMs / 1000, 3)} s computation. Undo is available.`;
    if (result.diagnostics.conductanceLimited) message += ' Flow conductance was limited for numerical stability.';
    setStatus(message);
  } catch (error) {
    setStatus(error.message, error.name !== 'AbortError');
  } finally { eroding = false; updateButtons(); }
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function initializeFullscreen() {
  const workspace = element('workspace');
  const button = element('fullscreen');
  const supported = !!(document.fullscreenEnabled && workspace.requestFullscreen);
  button.disabled = !supported;

  const update = () => {
    const active = document.fullscreenElement === workspace;
    button.textContent = active ? 'Exit fullscreen' : 'Fullscreen';
    button.setAttribute('aria-pressed', String(active));
    button.title = !supported ? 'Fullscreen is unavailable in this browser or embedded view.'
      : active ? 'Exit fullscreen (Esc)' : 'View the scene fullscreen';
  };
  document.addEventListener('fullscreenchange', update);
  button.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement === workspace) await document.exitFullscreen();
      else await workspace.requestFullscreen();
    } catch (error) {
      setStatus(`Could not change fullscreen mode: ${error.message}`, true);
    }
    update();
  });
  update();
}

async function initialize() {
  initializeAccordions();
  initializeFullscreen();
  for (const family of FAMILIES) element('family').add(new Option(family.label, family.id));
  populateAlgorithms('fbm');
  element('family').addEventListener('change', () => { populateAlgorithms(); requestGeneration(); });
  element('algorithm').addEventListener('change', () => { populateAlgorithmControls(); requestGeneration(); });
  element('base-seed').addEventListener('input', () => requestGeneration());
  element('segments').addEventListener('change', () => requestGeneration());
  element('terrain-size-slider').addEventListener('input', () => {
    element('terrain-size').value = element('terrain-size-slider').value;
    requestGeneration();
  });
  element('terrain-size').addEventListener('input', () => {
    if (element('terrain-size').validity.valid) element('terrain-size-slider').value = element('terrain-size').value;
    requestGeneration();
  });
  for (const [id, definition] of Object.entries(EROSIONS)) {
    const quickButton = document.createElement('button');
    quickButton.type = 'button'; quickButton.className = 'full erosion-action'; quickButton.id = `apply-${id}`;
    quickButton.textContent = definition.button;
    quickButton.title = `Apply ${definition.label.toLowerCase()} to the current terrain`;
    quickButton.addEventListener('click', () => erode(id));
    element('erosion-actions').append(quickButton);

    const details = document.createElement('details'); details.id = `erosion-${id}`;
    const summary = document.createElement('summary'); summary.textContent = `${definition.label} settings`;
    const explanation = document.createElement('p'); explanation.className = 'hint'; explanation.textContent = definition.description;
    const controls = document.createElement('div'); controls.id = `parameters-${id}`;
    const applyButton = document.createElement('button'); applyButton.type = 'button';
    applyButton.className = 'full erosion-action'; applyButton.id = `apply-config-${id}`;
    applyButton.textContent = `Apply ${id === 'thermal' ? 'thermal erosion' : id === 'droplet' ? 'droplet erosion' : 'grid erosion'}`;
    applyButton.addEventListener('click', () => erode(id));
    details.append(summary, explanation, controls, applyButton); element('erosion-panels').append(details);
    erosionControls[id] = createParameterControls(controls, definition);
  }
  viewport = await createViewport(element('viewport'), element('heightmap-canvas'));
  if (viewport.is2DOnly) {
    element('view-mode').value = 'heightmap';
    for (const option of element('view-mode').options) option.disabled = option.value !== 'heightmap';
    element('wireframe').disabled = true;
    element('render-notice').hidden = false;
    element('render-notice').textContent = viewport.warning;
    element('render-notice').title = viewport.failureReason;
  }
  element('viewport').addEventListener('viewport-error', (event) => setStatus(event.detail, true));
  element('generate').addEventListener('click', () => requestGeneration({ freshSeed: true, immediate: true, frame: true }));
  element('cancel').addEventListener('click', () => {
    if (eroding) worker.cancel();
    else {
      generation.cancel();
      setStatus('Update canceled; the current terrain is unchanged.');
    }
  });
  element('undo').addEventListener('click', () => {
    if (busy || !store.undo()) return;
    element('show-base').checked = false; refreshViewport(); setStatus('Undid the last erosion operation exactly.');
  });
  element('reset').addEventListener('click', () => {
    if (busy || !store.reset()) return;
    element('show-base').checked = false; refreshViewport(); setStatus('Restored the last generated base terrain. Erosion history cleared.');
  });
  element('show-base').addEventListener('change', () => refreshViewport());
  element('wireframe').addEventListener('change', () => viewport.setWireframe(element('wireframe').checked));
  element('view-mode').addEventListener('change', () => {
    viewport.setMode(element('view-mode').value);
    element('wireframe').disabled = element('view-mode').value === 'heightmap';
    updateLabels();
  });
  element('frame-view').addEventListener('click', () => viewport.frameTerrain());
  element('export-json').addEventListener('click', () => {
    const map = store.currentHeightmap;
    const payload = { format: 'terrain-laboratory-heightmap', version: 1,
      width: map.width, height: map.height, size: map.size, cellSize: map.cellSize,
      orientation: 'row-major: data[z * width + x]; +Y is elevation',
      baseRecipe: store.baseRecipe, erosionOperations: store.operationLog,
      elevations: Array.from(map.data) };
    download(new Blob([JSON.stringify(payload)], { type: 'application/json' }), 'terrain-heightmap.json');
  });
  element('export-png').addEventListener('click', () => {
    element('heightmap-canvas').toBlob((blob) => { if (blob) download(blob, 'terrain-heightmap.png'); }, 'image/png');
  });
  window.addEventListener('beforeunload', () => { generation.cancel(); worker.dispose(); viewport.dispose(); });
  // Small read-only inspection surface for browser tests and educational debugging.
  // Copies prevent developer-console callers from accidentally mutating saved state.
  Object.defineProperty(window, 'terrainLab', { value: Object.freeze({
    getState: () => ({ busy, generationRunning: generation.running, generationQueued: generation.timer !== null, base: store.baseHeightmap ? cloneHeightmap(store.baseHeightmap) : null,
      current: store.currentHeightmap ? cloneHeightmap(store.currentHeightmap) : null,
      historyLength: store.history.length, operations: structuredClone(store.operationLog),
      baseRecipe: structuredClone(store.baseRecipe) }),
    getRendererInfo: () => viewport.is2DOnly ? { backend: 'Canvas2D', calls: 0, triangles: 0, geometries: 0 }
      : { backend: 'WebGL2', calls: viewport.renderer.info.render.calls,
        triangles: viewport.renderer.info.render.triangles, geometries: viewport.renderer.info.memory.geometries },
  }), writable: false });
  updateButtons();
  requestGeneration({ freshSeed: true, immediate: true, frame: true });
}

initialize().catch((error) => setStatus(error.message, true));
