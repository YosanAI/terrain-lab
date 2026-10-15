/** Single source of truth for defaults, UI controls, and worker-side validation. */
const number = (key, label, value, min, max, step = 1, help = '') =>
  ({ key, label, type: 'number', default: value, min, max, step, help });
const slider = (key, label, value, min, max, step = 0.01, help = '') =>
  ({ ...number(key, label, value, min, max, step, help), type: 'range' });
const select = (key, label, value, options, help = '') =>
  ({ key, label, type: 'select', default: value, options, help });
const only = (definition, predicate) => ({ ...definition, visible: predicate });
const baseNoise = () => select('baseNoise', 'Gradient source', 'simplex', [['perlin', 'Perlin'], ['simplex', 'Simplex']]);
const frequency = () => slider('frequency', 'Frequency', 4, 0.25, 20, 0.25, 'Noise-domain units across the full terrain.');
const amplitude = () => slider('amplitude', 'Amplitude (world units)', 60, 0, 500, 1, 'Actual elevation multiplier; results are not rescaled to min/max.');
const octaves = () => slider('octaves', 'Octaves', 6, 1, 10, 1);
const lacunarity = () => slider('lacunarity', 'Lacunarity', 2, 1, 4, 0.05);
const persistence = () => slider('persistence', 'Persistence', 0.5, 0, 1, 0.01);
const sharpness = () => slider('sharpness', 'Ridge sharpness', 2, 0.5, 6, 0.1);
const gain = () => slider('gain', 'Octave feedback gain', 2, 0, 4, 0.05);

export const FAMILIES = [
  { id: 'gradient', label: 'Noise & fractals', algorithms: ['perlin', 'simplex', 'fbm', 'ridged', 'warp'] },
  { id: 'recursive', label: 'Recursive subdivision', algorithms: ['diamondSquare'] },
  { id: 'cellular', label: 'Cells & distances', algorithms: ['voronoi', 'worley'] },
  { id: 'geological', label: 'Faults & tectonic plates', algorithms: ['fault', 'tectonic'] },
];

export const GENERATORS = {
  perlin: {
    label: 'Perlin noise',
    description: 'Grid-corner gradients, dot products, and quintic interpolation. A single octave, not fBm.',
    params: [frequency(), amplitude()],
  },
  simplex: {
    label: 'Simplex noise',
    description: 'A skewed triangular lattice with three compact gradient kernels per sample.',
    params: [frequency(), amplitude()],
  },
  fbm: {
    label: 'Fractal Brownian motion (fBm)',
    description: 'A normalized sum of gradient-noise frequency octaves. Lacunarity scales frequency; persistence scales amplitude.',
    params: [baseNoise(), octaves(), lacunarity(), persistence(), frequency(), amplitude()],
  },
  ridged: {
    label: 'Ridged multifractal',
    description: 'Transforms each octave with (1 − |noise|)^sharpness, with feedback from the preceding octave.',
    params: [baseNoise(), octaves(), lacunarity(), persistence(), sharpness(), gain(), frequency(), amplitude()],
  },
  warp: {
    label: 'Domain-warped terrain',
    description: 'Two independently seeded noise fields displace the sampling coordinates before evaluating the main terrain.',
    params: [
      select('warpMode', 'Main terrain', 'fbm', [['fbm', 'Warped fBm'], ['ridged', 'Warped ridged multifractal']]),
      baseNoise(), slider('warpFrequency', 'Warp frequency', 3, 0.25, 16, 0.25),
      slider('warpStrength', 'Warp strength (domain units)', 0.2, 0, 1.5, 0.01),
      slider('warpOctaves', 'Warp octaves', 3, 1, 8, 1),
      { ...frequency(), label: 'Main terrain frequency' }, { ...octaves(), label: 'Main terrain octaves' },
      lacunarity(), persistence(), only(sharpness(), (p) => p.warpMode === 'ridged'),
      only(gain(), (p) => p.warpMode === 'ridged'), amplitude(),
    ],
  },
  diamondSquare: {
    label: 'Diamond-square',
    description: 'Alternating diamond and square midpoint-displacement steps. All offered resolutions are 2^n + 1 samples.',
    params: [slider('cornerRange', 'Corner range (± world units)', 15, 0, 200, 1),
      slider('displacement', 'Initial displacement', 50, 0, 300, 1),
      slider('roughness', 'Displacement decay', 0.53, 0, 1, 0.01)],
  },
  voronoi: {
    label: 'Voronoi terrain',
    description: 'Nearest-site cells, smoothly blended cell heights, or ridges on geometric cell boundaries.',
    params: [
      select('mode', 'Construction', 'smooth', [['cells', 'Cell-height regions'], ['smooth', 'Smoothed cells'], ['ridges', 'Boundary ridges']]),
      slider('pointCount', 'Feature points', 48, 2, 256, 1), slider('jitter', 'Feature-point jitter', 1, 0, 1, 0.01),
      slider('variation', 'Cell-height variation', 1, 0, 2, 0.05),
      only(slider('blending', 'Boundary blending / width', 0.25, 0, 1, 0.01,
        'Relative to the nominal cell width. Zero blending restores hard cells.'), (p) => p.mode !== 'cells'),
      only(sharpness(), (p) => p.mode === 'ridges'), amplitude(),
    ],
  },
  worley: {
    label: 'Worley distance noise',
    description: 'Exact nearest and second-nearest site distances. F2 − F1 is zero at boundaries, rather than a ridge inversion.',
    params: [slider('density', 'Feature density (per axis)', 5, 2, 14, 1),
      select('distanceMode', 'Distance mode', 'f2MinusF1', [['f1', 'F1 · nearest'], ['f2', 'F2 · second-nearest'], ['f2MinusF1', 'F2 − F1 · boundaries']]),
      slider('exponent', 'Distance exponent', 1.2, 0.2, 4, 0.1),
      slider('frequency', 'Frequency', 1, 0.25, 8, 0.25), amplitude()],
  },
  fault: {
    label: 'Fault formation',
    description: 'Repeated, randomly oriented fault lines displace opposite sides. Smooth faults use a tanh transition.',
    params: [slider('iterations', 'Fault iterations', 160, 1, 2000, 1),
      slider('displacement', 'Initial displacement', 3, 0, 50, 0.1),
      slider('decay', 'Displacement decay', 0.99, 0, 1, 0.001),
      select('faultType', 'Fault profile', 'smooth', [['sharp', 'Sharp step'], ['smooth', 'Smooth transition']]),
      only(slider('transitionWidth', 'Transition width (world units)', 4, 0.1, 100, 0.1), (p) => p.faultType === 'smooth')],
  },
  tectonic: {
    label: 'Simplified tectonic plates',
    description: 'True Voronoi boundary segments connect moving plate regions. Convergence uplifts and divergence depresses. This is a procedural model, not crustal physics.',
    params: [slider('plateCount', 'Number of plates', 12, 2, 40, 1),
      slider('motionStrength', 'Plate motion strength', 1, 0, 4, 0.05),
      slider('compression', 'Compression / uplift', 30, 0, 150, 1),
      slider('divergence', 'Divergence / depression', 14, 0, 150, 1),
      slider('boundaryWidth', 'Boundary influence (world units)', 10, 0.25, 100, 0.25),
      slider('smoothing', 'Regional smoothing passes', 4, 0, 30, 1)],
  },
};

export const EROSIONS = {
  droplet: {
    label: 'Hydraulic erosion · droplets', button: 'Hydraulic erosion · droplets',
    description: 'Seeded particles move downhill, erode, carry and deposit sediment. Open edges allow recorded sediment export.',
    params: [slider('droplets', 'Number of droplets', 20000, 1, 500000, 1),
      slider('lifetime', 'Maximum lifetime (steps)', 64, 1, 500, 1),
      slider('inertia', 'Inertia', 0.3, 0, 0.99, 0.01),
      slider('capacity', 'Sediment capacity coefficient', 4, 0, 30, 0.1),
      slider('minimumCapacity', 'Minimum sediment capacity', 0.01, 0, 1, 0.001),
      slider('erosionRate', 'Erosion rate', 0.3, 0, 1, 0.01),
      slider('depositionRate', 'Deposition rate', 0.3, 0, 1, 0.01),
      slider('evaporation', 'Evaporation per step', 0.02, 0, 1, 0.005),
      slider('gravity', 'Gravity / acceleration', 4, 0, 30, 0.1),
      slider('radius', 'Erosion radius (samples)', 3, 1, 8, 1),
      { key: 'seed', label: 'Droplet seed', type: 'text', default: 'droplets-42' }],
  },
  grid: {
    label: 'Hydraulic erosion · grid flow', button: 'Hydraulic erosion · grid flow',
    description: 'Cell-to-cell water and sediment fluxes. Closed borders; each run starts dry and settles its final sediment. Conductance is limited for stability.',
    params: [slider('iterations', 'Simulation iterations', 150, 1, 1500, 1),
      slider('rainfall', 'Rainfall depth per iteration', 0.03, 0, 1, 0.005),
      slider('flowRate', 'Flow conductance', 1, 0, 4, 0.05),
      slider('timeStep', 'Time step', 0.2, 0.01, 1, 0.01),
      slider('capacity', 'Sediment capacity coefficient', 2, 0, 20, 0.1),
      slider('erosionRate', 'Erosion rate', 0.3, 0, 1, 0.01),
      slider('depositionRate', 'Deposition rate', 0.3, 0, 1, 0.01),
      slider('evaporation', 'Evaporation rate', 0.1, 0, 1, 0.01)],
  },
  thermal: {
    label: 'Thermal erosion', button: 'Thermal erosion',
    description: 'Transfers material only where height difference / horizontal distance exceeds tan(talus). Simultaneous conservative updates.',
    params: [slider('talusAngle', 'Talus angle (degrees)', 30, 0, 85, 1),
      slider('iterations', 'Iterations', 100, 1, 2000, 1),
      slider('transportRate', 'Material transport rate', 0.6, 0, 1, 0.01),
      select('neighborhood', 'Neighborhood', '8', [['4', '4 · cardinal'], ['8', '8 · cardinal + diagonal']])],
  },
};

export function defaultParameters(definition) {
  return Object.fromEntries(definition.params.map((parameter) => [parameter.key, parameter.default]));
}

export function validateParameters(definition, supplied = {}) {
  const values = defaultParameters(definition);
  for (const spec of definition.params) {
    const value = supplied[spec.key] ?? spec.default;
    if (spec.type === 'select') {
      if (!spec.options.some(([key]) => key === String(value))) throw new RangeError(`Invalid ${spec.label}.`);
      values[spec.key] = String(value);
    } else if (spec.type === 'text') {
      values[spec.key] = String(value).slice(0, 128);
    } else {
      const numeric = Number(value);
      if (value === '' || !Number.isFinite(numeric) || numeric < spec.min || numeric > spec.max
        || (spec.step === 1 && !Number.isInteger(numeric))) {
        throw new RangeError(`${spec.label} must be ${spec.step === 1 ? 'an integer ' : ''}from ${spec.min} to ${spec.max}.`);
      }
      values[spec.key] = numeric;
    }
  }
  return values;
}
