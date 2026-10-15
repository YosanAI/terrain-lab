import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHeightmap, cloneHeightmap, assertHeightmap, sampleHeightAndGradient, depositBilinear } from '../src/core/heightmap.js';
import { createRandom } from '../src/core/random.js';
import { sum } from '../src/core/math.js';
import { generateTerrain, applyErosion } from '../src/algorithms/index.js';
import { createPerlinNoise, createSimplexNoise } from '../src/algorithms/noise.js';
import { createFeaturePoints, FeatureIndex } from '../src/algorithms/feature-points.js';
import { buildPlateBoundaries } from '../src/algorithms/geological.js';
import { TerrainStore } from '../src/core/terrain-store.js';
import { GENERATORS, EROSIONS, defaultParameters } from '../src/ui/parameters.js';

const settings = { segments: 32, size: 64 };
const hash = (map) => createHash('sha256').update(Buffer.from(map.data.buffer)).digest('hex');
const generate = (algorithm, overrides = {}, config = settings) => generateTerrain(algorithm,
  { ...defaultParameters(GENERATORS[algorithm]), seed: 'test-42', ...overrides }, config).map;
const erode = (algorithm, map, overrides = {}) => applyErosion(algorithm, map,
  { ...defaultParameters(EROSIONS[algorithm]), ...overrides });
const finite = (map) => assert.ok(map.data.every(Number.isFinite));
const variance = (map) => { const mean = sum(map.data) / map.data.length;
  return map.data.reduce((value, height) => value + (height - mean) ** 2, 0) / map.data.length; };
const epsilon = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b} ± ${tolerance}`);

for (const algorithm of Object.keys(GENERATORS)) {
  test(`${algorithm}: deterministic, finite, non-flat, and seed-sensitive`, () => {
    const a = generate(algorithm), b = generate(algorithm), c = generate(algorithm, { seed: 'another-seed' });
    finite(a); assert.equal(hash(a), hash(b)); assert.notEqual(hash(a), hash(c));
    assert.ok(variance(a) > 1e-6); assert.equal(a.data.length, 33 * 33);
  });
}

test('All generator families actually produce distinct arrays', () => {
  const hashes = new Set(Object.keys(GENERATORS).map((id) => hash(generate(id))));
  assert.equal(hashes.size, Object.keys(GENERATORS).length);
});

test('Perlin grid vertices vanish; simplex uses a distinct triangular lattice', () => {
  const perlin = createPerlinNoise(123), simplex = createSimplexNoise(123);
  for (let y = -3; y < 3; y++) for (let x = -3; x < 3; x++) epsilon(perlin(x, y), 0);
  assert.notEqual(perlin(0.4, 0.7), simplex(0.4, 0.7));
  epsilon(perlin(1 - 1e-7, 0.4), perlin(1 + 1e-7, 0.4), 1e-5);
  epsilon(simplex(0.4 - 1e-7, 0.4), simplex(0.4 + 1e-7, 0.4), 1e-5);
});

test('One-octave fBm equals its single-octave gradient source', () => {
  for (const source of ['perlin', 'simplex']) assert.equal(hash(generate(source)),
    hash(generate('fbm', { baseNoise: source, octaves: 1 })));
});

test('Zero coordinate warping exactly restores the main terrain', () => {
  assert.equal(hash(generate('warp', { warpStrength: 0 })), hash(generate('fbm')));
  assert.equal(hash(generate('warp', { warpStrength: 0, warpMode: 'ridged' })), hash(generate('ridged')));
  assert.notEqual(hash(generate('warp', { warpStrength: 0.4 })), hash(generate('fbm')));
});

test('Amplitude is an actual multiplier, without per-map normalization', () => {
  const a = generate('fbm', { amplitude: 20 }), b = generate('fbm', { amplitude: 40 });
  for (let i = 0; i < a.data.length; i++) epsilon(b.data[i], a.data[i] * 2, 1e-5);
});

test('Diamond-square rejects incompatible dimensions and respects zero displacement', () => {
  assert.throws(() => generate('diamondSquare', {}, { segments: 30, size: 64 }), /2\^n/);
  const zero = generate('diamondSquare', { cornerRange: 0, displacement: 0 });
  assert.ok(zero.data.every((value) => value === 0));
});

test('k-d tree nearest-two results match brute-force distances', () => {
  const points = createFeaturePoints(97, 1, 42), index = new FeatureIndex(points), random = createRandom('queries');
  for (let query = 0; query < 100; query++) {
    const x = random() * 1.4 - 0.2, y = random() * 1.4 - 0.2;
    const nearest = index.nearestTwo(x, y);
    const brute = points.map((point, id) => ({ id, distance: (point.x - x) ** 2 + (point.y - y) ** 2 }))
      .sort((a, b) => a.distance - b.distance || a.id - b.id);
    assert.equal(nearest.first, brute[0].id); assert.equal(nearest.second, brute[1].id);
    epsilon(nearest.distance1Squared, brute[0].distance); epsilon(nearest.distance2Squared, brute[1].distance);
  }
});

test('Worley F2 >= F1 and F2−F1 is genuinely their difference', () => {
  const a = generate('worley', { distanceMode: 'f1', exponent: 1, amplitude: 1 });
  const b = generate('worley', { distanceMode: 'f2', exponent: 1, amplitude: 1 });
  const c = generate('worley', { distanceMode: 'f2MinusF1', exponent: 1, amplitude: 1 });
  for (let i = 0; i < a.data.length; i++) {
    assert.ok(b.data[i] >= a.data[i]); epsilon(c.data[i], b.data[i] - a.data[i], 2e-7);
  }
});

test('Voronoi submodes differ and zero blend restores hard cells', () => {
  const hard = generate('voronoi', { mode: 'cells' }), smooth = generate('voronoi', { mode: 'smooth' });
  assert.notEqual(hash(hard), hash(smooth));
  assert.equal(hash(hard), hash(generate('voronoi', { mode: 'smooth', blending: 0 })));
  assert.notEqual(hash(smooth), hash(generate('voronoi', { mode: 'ridges' })));
});

test('Voronoi plate edges are actual shared bisectors clipped to the domain', () => {
  const points = [{ x: 0.25, y: 0.5 }, { x: 0.75, y: 0.5 }];
  const edges = buildPlateBoundaries(points);
  assert.equal(edges.length, 1); epsilon(edges[0].x1, 0.5); epsilon(edges[0].x2, 0.5);
  epsilon(Math.abs(edges[0].y2 - edges[0].y1), 1);
});

test('No plate motion produces no tectonic uplift; compression and divergence are signed', () => {
  assert.ok(generate('tectonic', { motionStrength: 0 }).data.every((value) => value === 0));
  const up = generate('tectonic', { divergence: 0 }); assert.ok(up.data.every((value) => value >= 0));
  const down = generate('tectonic', { compression: 0 }); assert.ok(down.data.every((value) => value <= 0));
});

test('Bilinear height and derivatives reproduce a tilted plane, including edges', () => {
  const map = createHeightmap(8, 16);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) map.data[y * 9 + x] = 2 * (x * 2) + 3 * (y * 2) + 7;
  for (const [x, y] of [[1.2, 5.6], [8, 8], [0, 0]]) {
    const value = sampleHeightAndGradient(map.data, 9, 9, x, y, {}, map.cellSize);
    epsilon(value.height, 4 * x + 6 * y + 7); epsilon(value.gradientX, 2); epsilon(value.gradientY, 3);
  }
});

test('Bilinear deposition conserves its amount at corners and interior positions', () => {
  const values = new Float64Array(81);
  depositBilinear(values, 9, 9, 8, 8, 3);
  depositBilinear(values, 9, 9, 1.25, 3.67, 2);
  epsilon(sum(values), 5); assert.ok(values.every((value) => value >= 0));
});

for (const algorithm of Object.keys(EROSIONS)) {
  test(`${algorithm}: modifies terrain, remains finite, and is deterministic`, () => {
    const a = generate('fbm'), b = cloneHeightmap(a), before = hash(a);
    const params = { droplets: 500, iterations: 30, talusAngle: 10 };
    erode(algorithm, a, params); erode(algorithm, b, params);
    finite(a); assert.equal(hash(a), hash(b)); assert.notEqual(hash(a), before);
  });
}

test('Droplet erosion conserves terrain + exported sediment', () => {
  const map = generate('fbm');
  const result = erode('droplet', map, { droplets: 2500 });
  assert.ok(result.diagnostics.exportedSediment >= 0);
  assert.ok(Math.abs(result.diagnostics.massError) < 0.002, JSON.stringify(result.diagnostics));
});

test('Grid water and sediment stay nonnegative and conserve their balances', () => {
  const map = generate('fbm');
  const result = erode('grid', map, { iterations: 70, timeStep: 1, flowRate: 4, rainfall: 0.1 });
  const d = result.diagnostics;
  assert.ok(d.minimumWater >= 0); assert.ok(d.minimumSediment >= 0);
  assert.ok(Math.abs(d.waterBalanceError) < 1e-6, JSON.stringify(d));
  assert.ok(Math.abs(d.massError) < 0.003, JSON.stringify(d));
  assert.ok(d.conductance <= 0.24); assert.ok(d.conductanceLimited);
});

test('Zero-rainfall grid erosion and zero erosion-rate droplets do not alter terrain', () => {
  const dry = generate('fbm'), unchanged = hash(dry);
  erode('grid', dry, { iterations: 20, rainfall: 0 }); assert.equal(hash(dry), unchanged);
  erode('droplet', dry, { droplets: 300, erosionRate: 0 }); assert.equal(hash(dry), unchanged);
});

test('Thermal redistribution conserves material and reduces variance', () => {
  const map = createHeightmap(16, 16); map.data[8 * 17 + 8] = 100;
  const before = variance(map), initialMass = sum(map.data);
  erode('thermal', map, { talusAngle: 0, iterations: 100 });
  epsilon(sum(map.data), initialMass, 1e-5); assert.ok(variance(map) < before); assert.ok(map.data.every((h) => h >= 0));
});

test('Thermal angle uses horizontal spacing, not raw height difference', () => {
  const map = createHeightmap(8, 80);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) map.data[y * 9 + x] = 2 * x;
  const before = hash(map); erode('thermal', map, { talusAngle: 30, iterations: 10 });
  assert.equal(hash(map), before); // 2/10 < tan(30°)
  map.cellSize = 1; map.size = 8;
  erode('thermal', map, { talusAngle: 30, iterations: 10 }); assert.notEqual(hash(map), before);
});

test('Thermal delta-buffer result is symmetric under traversal reversal', () => {
  const a = generate('fbm'), b = cloneHeightmap(a); b.data.reverse();
  erode('thermal', a, { iterations: 25, talusAngle: 15 }); erode('thermal', b, { iterations: 25, talusAngle: 15 });
  b.data.reverse(); for (let i = 0; i < a.data.length; i++) epsilon(a.data[i], b.data[i], 1e-5);
});

test('Invalid values fail clearly rather than producing NaN terrain', () => {
  assert.throws(() => generate('fbm', { frequency: NaN }), /Frequency/);
  assert.throws(() => generate('fbm', { octaves: 2.5 }), /integer/);
  assert.throws(() => generate('worley', { density: 9999 }), /density/);
  assert.throws(() => erode('thermal', generate('fbm'), { talusAngle: 90 }), /angle/);
});

test('State transitions: base immutability, cumulative erosion, exact undo and reset', () => {
  const store = new TerrainStore(20), base = generate('fbm'), baseHash = hash(base);
  store.generate(base, { algorithm: 'fbm', seed: 42 });
  const first = cloneHeightmap(store.currentHeightmap); erode('thermal', first, { iterations: 20, talusAngle: 10 });
  store.commitErosion(first, { algorithm: 'thermal' }); const firstHash = hash(store.currentHeightmap);
  const second = cloneHeightmap(store.currentHeightmap); erode('droplet', second, { droplets: 400 });
  store.commitErosion(second, { algorithm: 'droplet' });
  assert.equal(hash(store.baseHeightmap), baseHash); assert.notEqual(hash(store.currentHeightmap), firstHash);
  assert.equal(store.history.length, 2); store.undo(); assert.equal(hash(store.currentHeightmap), firstHash);
  store.undo(); assert.equal(hash(store.currentHeightmap), baseHash); assert.equal(store.undo(), false);
  store.commitErosion(first, { algorithm: 'thermal' }); store.reset();
  assert.equal(hash(store.currentHeightmap), baseHash); assert.equal(store.history.length, 0);
  assert.equal(store.operationLog.length, 0);
});

test('Generating a fresh base clears history, with separate storage', () => {
  const store = new TerrainStore(); store.generate(generate('fbm'), {});
  const next = cloneHeightmap(store.currentHeightmap); next.data[0] += 1; store.commitErosion(next, {});
  store.generate(generate('simplex'), {}); assert.equal(store.history.length, 0);
  assert.notEqual(store.baseHeightmap.data.buffer, store.currentHeightmap.data.buffer);
});

test('Heightmap metadata rejects inconsistent spacing and malformed extents', () => {
  const map = createHeightmap(32, 64);
  assert.doesNotThrow(() => assertHeightmap(map));
  assert.throws(() => assertHeightmap({ ...map, cellSize: 1 }), /Invalid/);
  assert.throws(() => assertHeightmap({ ...map, size: NaN }), /Invalid/);
  assert.throws(() => assertHeightmap({ ...map, width: 32 }), /Invalid/);
  const nonFinite = cloneHeightmap(map); nonFinite.data[0] = Infinity;
  assert.throws(() => assertHeightmap(nonFinite), /Non-finite/);
});
