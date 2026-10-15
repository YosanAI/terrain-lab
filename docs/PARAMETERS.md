# Parameter reference

Generated from `src/ui/parameters.js` using `npm run docs:parameters`.

Every base generator also receives a string seed. The shared grid controls offer 128, 256 (default), or 512 segments, and a terrain size of 64–2048 world units (default 256). Base controls update live after a 180 ms pause using the current seed. Generate chooses a fresh random seed. Erosion settings take effect only after Apply. Bounded numeric controls use sliders with linked exact-value inputs.

Conditional controls are hidden when irrelevant: ridge sharpness / gain for warped ridges only, blending outside hard Voronoi cells, sharpness for Voronoi ridges, and transition width for smooth faults.

## Base generators

### Perlin noise (`perlin`)

Grid-corner gradients, dot products, and quintic interpolation. A single octave, not fBm.

| Control / API key | Default | Accepted values | Meaning / notes |
| --- | --- | --- | --- |
| Frequency / `frequency` | 4 | 0.25–20 | Noise-domain units across the full terrain. |
| Amplitude (world units) / `amplitude` | 60 | 0–500; integer | Actual elevation multiplier; results are not rescaled to min/max. |

### Simplex noise (`simplex`)

A skewed triangular lattice with three compact gradient kernels per sample.

| Control / API key | Default | Accepted values | Meaning / notes |
| --- | --- | --- | --- |
| Frequency / `frequency` | 4 | 0.25–20 | Noise-domain units across the full terrain. |
| Amplitude (world units) / `amplitude` | 60 | 0–500; integer | Actual elevation multiplier; results are not rescaled to min/max. |

### Fractal Brownian motion (fBm) (`fbm`)

A normalized sum of gradient-noise frequency octaves. Lacunarity scales frequency; persistence scales amplitude.

| Control / API key | Default | Accepted values | Meaning / notes |
| --- | --- | --- | --- |
| Gradient source / `baseNoise` | simplex | `perlin`: Perlin; `simplex`: Simplex | — |
| Octaves / `octaves` | 6 | 1–10; integer | — |
| Lacunarity / `lacunarity` | 2 | 1–4 | — |
| Persistence / `persistence` | 0.5 | 0–1 | — |
| Frequency / `frequency` | 4 | 0.25–20 | Noise-domain units across the full terrain. |
| Amplitude (world units) / `amplitude` | 60 | 0–500; integer | Actual elevation multiplier; results are not rescaled to min/max. |

### Ridged multifractal (`ridged`)

Transforms each octave with (1 − |noise|)^sharpness, with feedback from the preceding octave.

| Control / API key | Default | Accepted values | Meaning / notes |
| --- | --- | --- | --- |
| Gradient source / `baseNoise` | simplex | `perlin`: Perlin; `simplex`: Simplex | — |
| Octaves / `octaves` | 6 | 1–10; integer | — |
| Lacunarity / `lacunarity` | 2 | 1–4 | — |
| Persistence / `persistence` | 0.5 | 0–1 | — |
| Ridge sharpness / `sharpness` | 2 | 0.5–6 | — |
| Octave feedback gain / `gain` | 2 | 0–4 | — |
| Frequency / `frequency` | 4 | 0.25–20 | Noise-domain units across the full terrain. |
| Amplitude (world units) / `amplitude` | 60 | 0–500; integer | Actual elevation multiplier; results are not rescaled to min/max. |

### Domain-warped terrain (`warp`)

Two independently seeded noise fields displace the sampling coordinates before evaluating the main terrain.

| Control / API key | Default | Accepted values | Meaning / notes |
| --- | --- | --- | --- |
| Main terrain / `warpMode` | fbm | `fbm`: Warped fBm; `ridged`: Warped ridged multifractal | — |
| Gradient source / `baseNoise` | simplex | `perlin`: Perlin; `simplex`: Simplex | — |
| Warp frequency / `warpFrequency` | 3 | 0.25–16 | — |
| Warp strength (domain units) / `warpStrength` | 0.2 | 0–1.5 | — |
| Warp octaves / `warpOctaves` | 3 | 1–8; integer | — |
| Main terrain frequency / `frequency` | 4 | 0.25–20 | Noise-domain units across the full terrain. |
| Main terrain octaves / `octaves` | 6 | 1–10; integer | — |
| Lacunarity / `lacunarity` | 2 | 1–4 | — |
| Persistence / `persistence` | 0.5 | 0–1 | — |
| Ridge sharpness / `sharpness` | 2 | 0.5–6 | Conditionally displayed. |
| Octave feedback gain / `gain` | 2 | 0–4 | Conditionally displayed. |
| Amplitude (world units) / `amplitude` | 60 | 0–500; integer | Actual elevation multiplier; results are not rescaled to min/max. |

### Diamond-square (`diamondSquare`)

Alternating diamond and square midpoint-displacement steps. All offered resolutions are 2^n + 1 samples.

| Control / API key | Default | Accepted values | Meaning / notes |
| --- | --- | --- | --- |
| Corner range (± world units) / `cornerRange` | 15 | 0–200; integer | — |
| Initial displacement / `displacement` | 50 | 0–300; integer | — |
| Displacement decay / `roughness` | 0.53 | 0–1 | — |

### Voronoi terrain (`voronoi`)

Nearest-site cells, smoothly blended cell heights, or ridges on geometric cell boundaries.

| Control / API key | Default | Accepted values | Meaning / notes |
| --- | --- | --- | --- |
| Construction / `mode` | smooth | `cells`: Cell-height regions; `smooth`: Smoothed cells; `ridges`: Boundary ridges | — |
| Feature points / `pointCount` | 48 | 2–256; integer | — |
| Feature-point jitter / `jitter` | 1 | 0–1 | — |
| Cell-height variation / `variation` | 1 | 0–2 | — |
| Boundary blending / width / `blending` | 0.25 | 0–1 | Relative to the nominal cell width. Zero blending restores hard cells. |
| Ridge sharpness / `sharpness` | 2 | 0.5–6 | Conditionally displayed. |
| Amplitude (world units) / `amplitude` | 60 | 0–500; integer | Actual elevation multiplier; results are not rescaled to min/max. |

### Worley distance noise (`worley`)

Exact nearest and second-nearest site distances. F2 − F1 is zero at boundaries, rather than a ridge inversion.

| Control / API key | Default | Accepted values | Meaning / notes |
| --- | --- | --- | --- |
| Feature density (per axis) / `density` | 5 | 2–14; integer | — |
| Distance mode / `distanceMode` | f2MinusF1 | `f1`: F1 · nearest; `f2`: F2 · second-nearest; `f2MinusF1`: F2 − F1 · boundaries | — |
| Distance exponent / `exponent` | 1.2 | 0.2–4 | — |
| Frequency / `frequency` | 1 | 0.25–8 | — |
| Amplitude (world units) / `amplitude` | 60 | 0–500; integer | Actual elevation multiplier; results are not rescaled to min/max. |

### Fault formation (`fault`)

Repeated, randomly oriented fault lines displace opposite sides. Smooth faults use a tanh transition.

| Control / API key | Default | Accepted values | Meaning / notes |
| --- | --- | --- | --- |
| Fault iterations / `iterations` | 160 | 1–2000; integer | — |
| Initial displacement / `displacement` | 3 | 0–50 | — |
| Displacement decay / `decay` | 0.99 | 0–1 | — |
| Fault profile / `faultType` | smooth | `sharp`: Sharp step; `smooth`: Smooth transition | — |
| Transition width (world units) / `transitionWidth` | 4 | 0.1–100 | Conditionally displayed. |

### Simplified tectonic plates (`tectonic`)

True Voronoi boundary segments connect moving plate regions. Convergence uplifts and divergence depresses. This is a procedural model, not crustal physics.

| Control / API key | Default | Accepted values | Meaning / notes |
| --- | --- | --- | --- |
| Number of plates / `plateCount` | 12 | 2–40; integer | — |
| Plate motion strength / `motionStrength` | 1 | 0–4 | — |
| Compression / uplift / `compression` | 30 | 0–150; integer | — |
| Divergence / depression / `divergence` | 14 | 0–150; integer | — |
| Boundary influence (world units) / `boundaryWidth` | 10 | 0.25–100 | — |
| Regional smoothing passes / `smoothing` | 4 | 0–30; integer | — |

## Erosion operations

### Hydraulic erosion · droplets (`droplet`)

Seeded particles move downhill, erode, carry and deposit sediment. Open edges allow recorded sediment export.

| Control / API key | Default | Accepted values | Meaning / notes |
| --- | --- | --- | --- |
| Number of droplets / `droplets` | 20000 | 1–500000; integer | — |
| Maximum lifetime (steps) / `lifetime` | 64 | 1–500; integer | — |
| Inertia / `inertia` | 0.3 | 0–0.99 | — |
| Sediment capacity coefficient / `capacity` | 4 | 0–30 | — |
| Minimum sediment capacity / `minimumCapacity` | 0.01 | 0–1 | — |
| Erosion rate / `erosionRate` | 0.3 | 0–1 | — |
| Deposition rate / `depositionRate` | 0.3 | 0–1 | — |
| Evaporation per step / `evaporation` | 0.02 | 0–1 | — |
| Gravity / acceleration / `gravity` | 4 | 0–30 | — |
| Erosion radius (samples) / `radius` | 3 | 1–8; integer | — |
| Droplet seed / `seed` | droplets-42 | String, truncated to 128 characters | — |

### Hydraulic erosion · grid flow (`grid`)

Cell-to-cell water and sediment fluxes. Closed borders; each run starts dry and settles its final sediment. Conductance is limited for stability.

| Control / API key | Default | Accepted values | Meaning / notes |
| --- | --- | --- | --- |
| Simulation iterations / `iterations` | 150 | 1–1500; integer | — |
| Rainfall depth per iteration / `rainfall` | 0.03 | 0–1 | — |
| Flow conductance / `flowRate` | 1 | 0–4 | — |
| Time step / `timeStep` | 0.2 | 0.01–1 | — |
| Sediment capacity coefficient / `capacity` | 2 | 0–20 | — |
| Erosion rate / `erosionRate` | 0.3 | 0–1 | — |
| Deposition rate / `depositionRate` | 0.3 | 0–1 | — |
| Evaporation rate / `evaporation` | 0.1 | 0–1 | — |

### Thermal erosion (`thermal`)

Transfers material only where height difference / horizontal distance exceeds tan(talus). Simultaneous conservative updates.

| Control / API key | Default | Accepted values | Meaning / notes |
| --- | --- | --- | --- |
| Talus angle (degrees) / `talusAngle` | 30 | 0–85; integer | — |
| Iterations / `iterations` | 100 | 1–2000; integer | — |
| Material transport rate / `transportRate` | 0.6 | 0–1 | — |
| Neighborhood / `neighborhood` | 8 | `4`: 4 · cardinal; `8`: 8 · cardinal + diagonal | — |

