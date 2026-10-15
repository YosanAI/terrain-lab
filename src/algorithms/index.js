import { createHeightmap, assertHeightmap } from '../core/heightmap.js';
import { GENERATORS, EROSIONS, validateParameters } from '../ui/parameters.js';
import { generateNoiseTerrain } from './noise.js';
import { generateDiamondSquare } from './diamond-square.js';
import { generateVoronoi, generateWorley } from './cellular.js';
import { generateFaultTerrain, generateTectonicTerrain } from './geological.js';
import { erodeDroplets } from './hydraulic-droplet.js';
import { erodeGrid } from './hydraulic-grid.js';
import { erodeThermal } from './thermal.js';

const BASE_FUNCTIONS = {
  perlin: generateNoiseTerrain, simplex: generateNoiseTerrain, fbm: generateNoiseTerrain,
  ridged: generateNoiseTerrain, warp: generateNoiseTerrain,
  diamondSquare: generateDiamondSquare, voronoi: generateVoronoi, worley: generateWorley,
  fault: generateFaultTerrain, tectonic: generateTectonicTerrain,
};
const EROSION_FUNCTIONS = { droplet: erodeDroplets, grid: erodeGrid, thermal: erodeThermal };

export function generateTerrain(algorithm, supplied, settings, progress) {
  const definition = GENERATORS[algorithm];
  if (!definition) throw new Error(`Unknown terrain algorithm: ${algorithm}`);
  const parameters = validateParameters(definition, supplied);
  parameters.seed = String(supplied.seed ?? 'terrain-42').slice(0, 128);
  parameters.algorithm = algorithm;
  const map = createHeightmap(Number(settings.segments), Number(settings.size));
  BASE_FUNCTIONS[algorithm](map, parameters, progress);
  assertHeightmap(map);
  return { map, parameters };
}

export function applyErosion(algorithm, map, supplied, progress) {
  const definition = EROSIONS[algorithm];
  if (!definition) throw new Error(`Unknown erosion algorithm: ${algorithm}`);
  assertHeightmap(map);
  const parameters = validateParameters(definition, supplied);
  const diagnostics = EROSION_FUNCTIONS[algorithm](map, parameters, progress);
  assertHeightmap(map);
  return { map, parameters, diagnostics };
}
