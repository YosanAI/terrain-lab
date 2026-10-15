# Algorithms and intentional simplifications

This is a heightfield laboratory: one elevation per XZ sample. It cannot represent overhangs, caves, or layered rock. No generator silently falls back to a generic fBm preset.

## Shared conventions

The square domain has `(segments + 1)²` samples, stored row-major in a `Float32Array`. World spacing is `size / segments`; Y is elevation. Seeds are strings hashed into deterministic pseudorandom generators. Noise coordinates use the normalized horizontal domain, so changing physical size stretches the same noise pattern while changing the slopes used by erosion. Fault and tectonic boundary widths are explicitly in world units.

Elevation is not min/max-normalized after generation or erosion. Amplitude remains a meaningful multiplier and erosion keeps the same vertical units. fBm divides by its sum of octave weights, which is analytical amplitude normalization, not normalization using the observed output extrema. Fixed base color limits keep erosion comparisons meaningful; colors may saturate when elevations move outside those limits. Signed-change colors use their own symmetric difference range.

Erosion uses Float64 scratch arrays to limit accumulated rounding, then stores the result as Float32. Material diagnostics report sums of sample heights, not kilograms. Equal-area control-cell volume is proportional to that sum times spacing squared. This discretization is not exact quadrature of the rendered triangular surface at the outermost vertices. Small Float32 commit errors are therefore distinguished from conservation in the redistribution rules.

All algorithms run on the CPU in the worker. Progress is periodically reported; intermediate partial results are not applied to the visible map. Parameters are validated against the shared schema before work begins. Boundaries are nonperiodic.

## A. Gradient noise and fractal terrain

### A1. Perlin noise

The implementation hashes four surrounding integer grid corners through a seeded permutation, assigns gradient vectors, and computes their dot products with corner-to-sample displacement. Each axis is interpolated using the quintic fade `6t⁵ − 15t⁴ + 10t³`. This is a single gradient-noise layer, not multioctave terrain.

Frequency controls the number of noise-domain units across the terrain; amplitude multiplies the signal; the seed selects the gradient permutation. A fixed non-integer sampling offset avoids accidentally sampling only the zero-valued lattice corners.

### A2. Simplex noise

The 2D input is skewed by `(√3 − 1)/2` to locate a triangular simplex, then unskewed by `(3 − √3)/6`. The triangle's three corner gradients contribute compact-support terms of the form `max(0, 0.5 − r²)⁴ · dot(gradient, displacement)`. This lattice and kernel construction are genuinely different from Perlin interpolation.

Its controls are frequency, amplitude, and seed. The two noise sources have conventional scale factors, but identical amplitude settings do not guarantee identical measured RMS height.

### A3. fBm

For octave index `k`, frequency is `baseFrequency × lacunarityᵏ` and weight is `persistenceᵏ`. Sum the weighted Perlin or Simplex samples and divide by the sum of weights. Increasing octave count adds finer variation. Lacunarity sets frequency growth; persistence sets amplitude decay.

With one octave, the output is exactly the chosen single-octave source using the same parameters. Octaves can exceed what the chosen mesh resolves; this demo deliberately allows such aliasing experiments rather than silently dropping user-requested frequencies. A higher resolution is needed to inspect fine detail accurately.

### A4. Ridged multifractal

Each octave becomes `max(0, 1 − |noise|)^sharpness`. Its contribution is multiplied by feedback from the previous octave; the next feedback is clamped from the transformed signal times the feedback gain. This concentrates high-frequency detail in appropriate ridge regions rather than merely adding absolute noise layers.

Controls include the gradient source, octave count, lacunarity, persistence, ridge sharpness, feedback gain, frequency, amplitude, and seed. Sharpness controls ridge concentration; feedback gain is separate from persistence.

### A5. Domain warping

Two independently seeded multioctave fields produce coordinate offsets:

```text
qx = u + warpStrength × warpNoiseX(u, v)
qz = v + warpStrength × warpNoiseZ(u, v)
height = mainTerrain(qx, qz)
```

The main terrain is either fBm or a ridged multifractal. Warp frequency and octave count control the distortion field. Main frequency and octave count control the final sampled field. Lacunarity and persistence are shared by both. Warp strength is expressed in normalized domain units, not elevation units. Ridge-specific controls appear only for the ridged main terrain. Zero warp strength exactly restores the equivalent unwarped generator.

## B. Recursive subdivision

### B1. Diamond-square

Initialize four corners uniformly within the requested ±corner elevation range. A diamond step averages four corners of each square and adds random displacement. A square step averages the valid adjacent diamond centers / existing neighbors and adds another displacement. Halve the spatial step and multiply displacement by roughness until all samples are filled.

Only `2ⁿ + 1` sample dimensions are accepted. All three UI resolutions satisfy that requirement. Edges use only valid neighbors, not wrapping. Initial displacement and its decay control newly introduced variation independently of the corner range. The seed determines all displacements. This is actual midpoint subdivision, not noise resampling.

## C. Cellular and distance-based terrain

Shared utilities generate deterministic feature sites and implement exact nearest-two lookup with a balanced k-d tree. Ties are resolved deterministically. Voronoi ridges additionally compute the distance to the actual cell boundary: a nearest-site bisector test against all competing sites, rather than assuming the second-nearest point always identifies the closest boundary.

### C1. Voronoi terrain

Features are distributed through shuffled, jittered stratified cells. The requested feature count is exact. Each point has an independent seeded elevation.

**Cell heights:** assign the nearest point's elevation. These are intentionally discontinuous regions.

**Smoothed cells:** blend all site elevations using Gaussian distance weights. Subtract the nearest squared distance inside the exponent for numerical stability. Using all sites avoids artificial jumps when a fixed nearest-k membership changes. Zero blending restores hard cell heights.

**Boundary ridges:** use `exp(−(boundaryDistance / width)^sharpness)`, with smoothly interpolated regional elevation modulating ridge height. The regional interpolation also avoids discontinuities where second-nearest site identity changes. A small positive minimum ridge width is retained when the blending control is zero; a mathematically zero-width line would otherwise be missed by nearly every mesh vertex.

Point count controls typical cell size; jitter moves points within stratified cells; variation scales regional heights; blending controls smooth-cell influence or ridge width; sharpness affects ridges only; amplitude and seed retain their usual roles. This generator does not perform tectonic motion.

### C2. Worley noise

Generate one coordinate-hashed jittered point per lattice cell, including a padded border, then query exact Euclidean nearest distances. Coordinate hashing makes the same sites persist when frequency changes the sampled domain extent. Distances are multiplied by feature density so their scale remains useful across density settings.

The selected signal is `F1`, `F2`, or `F2 − F1`; the signal is raised to the distance exponent and multiplied by amplitude. `F2 − F1` approaches zero at cell boundaries: it is a boundary pattern, not an automatically inverted ridge. Density is sites per axis per unit noise domain, while frequency controls how much of that domain is sampled. Both change feature count visible across the terrain, but with distinct parameterization and stable site identity.

## D. Geological generators

### D1. Fault formation

Each iteration samples a random line orientation and offset, evaluates signed distance to the line, and adds positive displacement on one side and negative displacement on the other. Hard faults use a sign function; smooth faults use a hyperbolic-tangent transition scaled by the requested world-space width. Displacement is multiplied by the decay after every iteration.

Iteration count increases structural complexity. Initial displacement and decay control cumulative relief. Transition width is hidden for sharp faults. These are accumulated fault displacements, not additions of generic noise.

### D2. Simplified tectonic plates

Seeded Voronoi sites define plate regions and each plate receives a planar motion vector. For each candidate pair, the generator clips its bisector against the terrain square and every other Voronoi half-plane. Only actual shared finite edge segments survive.

The relative closing speed along the A-to-B boundary normal is:

```text
closingSpeed = dot(velocityA − velocityB, normalAtoB)
```

Positive closing speed scales compression / uplift; negative speed scales divergence / depression. Gaussian influence around the actual connected edge segments produces broad mountain belts and rifts. Regional smoothing applies a bounded symmetric diffusion pass to the generated relief. There is no hidden background fBm. Zero plate motion produces a flat field.

Plate count controls regional structure. Motion strength scales relative velocities. Compression and divergence separately control positive and negative relief. Boundary width sets belt breadth in world units. Smoothing controls diffusion passes.

**Intentional simplification:** plates do not actually advect through time; no elastic crust, subduction geometry, isostasy, mantle convection, rheology, transform-fault modeling, or rock properties are simulated. Edge overlap may add uplift at junctions. The result is a procedural relative-motion model, not a physical Earth-crust solver.

## E. Erosion operations

### E1. Droplet hydraulic erosion

Each seeded particle spawns on the current map with unit water, an initially zero heading, and initial speed. Bilinear interpolation supplies height and analytic world-space gradient. The heading combines downhill gradient and inertia, then advances one grid spacing. Capacity depends on downhill slope, speed, water, the capacity coefficient, and a minimum wet capacity.

Particles erode when under capacity, using a normalized radial brush; eroded material is added to their sediment load. Erosion is limited by downhill relief and a receiving-surface floor to reduce one-step pits. Overloaded particles deposit a fraction of excess load. Uphill particles deposit toward the elevation rise, bounded by the sediment they actually carry. Deposits are distributed bilinearly rather than concentrated at a nearest vertex.

Speed follows an energy-like acceleration update; water evaporates each step. Particles stop on depletion, negligible heading or speed, maximum lifetime, or exit. Interior residual sediment is deposited; sediment carried over an open boundary is explicitly recorded as exported material.

Controls: droplet count, lifetime, inertia, capacity coefficient and minimum, erosion / deposition fractions, evaporation, acceleration coefficient, radius, and a separate droplet seed. The extra seed enables deterministic repeated erosion of the same input.

**Simplifications:** particles do not interact; there is no persistent surface-water depth, infiltration, vegetation, lithology, or rock-layer model. Lifetime and brush radius are in samples, so changing resolution changes physical trajectory length / brush width unless parameters are adjusted. This is not a calibrated hydraulic measurement in SI units. Interior termination settles the remaining load even when the per-step deposition rate is zero.

### E2. Grid hydraulic erosion

A separate Eulerian solver keeps terrain elevation, water depth, sediment thickness, and four outgoing directional water fluxes for every sample. Each step adds rainfall, computes flow from water-surface differences, and scales outgoing transfers so a cell never sends more water than it holds. Incoming and outgoing transfers update water simultaneously.

A simple capacity estimate uses wet depth, outflow-derived speed, and downhill terrain slope. Bed exchange uses frozen terrain slopes and a delta buffer. Donor-cell sediment advection moves sediment with the same water fractions, conserving transport and maintaining nonnegative quantities. Evaporation removes water; dry cells settle their sediment.

The diffusive conductance is limited to `min(0.24, flowRate × dt / spacing²)`. The outflow positivity limiter and capped bed changes provide additional safeguards. The operation log reports when the requested conductance was limited. Rainfall means depth per iteration; erosion, deposition, and evaporation rates are multiplied by the time step.

Controls: iteration count, rainfall, flow conductance, time step, sediment capacity, erosion and deposition rates, evaporation.

**Boundaries and lifecycle:** borders are closed. Each Apply starts with dry water / sediment grids on the existing current terrain, not a regenerated base. At completion, any remaining suspended sediment settles before the ground result is committed. Consequently terrain material is conserved to rounding, but repeated shorter Apply operations are not identical to one long run: they reset water and settle sediment between runs.

**Simplifications:** this is bounded diffusive surface flow, not a full momentum-conserving shallow-water or Navier–Stokes solver. Velocity is estimated from outgoing transfer, not stored as an inertial vector field. Donor-cell advection is deliberately straightforward and numerically diffusive. Water is state for computation, not a rendered fluid surface. It is not a claimed reproduction of a specific published virtual-pipe solver.

### E3. Thermal erosion

For each higher cell and lower neighbor, compute horizontal separation: spacing for cardinal neighbors and `√2 × spacing` for diagonals. The stable height drop is `tan(talusAngle) × separation`. Only the excess above that threshold can move.

Each transfer uses `transportRate / (2 × neighborhoodDegree)` times the excess. Equal positive / negative changes are accumulated in a separate Float64 delta buffer and committed after reading the whole map. This degree-normalized coefficient avoids an aggressive multi-neighbor overshoot and removes traversal-order bias. More iterations gradually relax unstable slopes.

Controls: talus angle in degrees, iterations, transport rate, and 4- or 8-neighbor stencil. Borders are closed. There is no particle water, no sediment suspension, and no base regeneration. Redistribution conserves the sum of heights apart from final Float32 rounding; a fixed number of passes need not fully bring every slope below the talus angle.

## Practical comparison notes

Keep seed, resolution, world size, and starting base fixed when comparing erosion methods. Undo and Reset restore exact Float32 arrays, not an approximate regeneration. Camera, wireframe, base comparison, colors, and parameter edits never modify the terrain.

The random generator is deterministic in a given runtime. Last-bit differences across different JavaScript engines are possible in transcendental functions such as sine, exponentials, and powers; no cross-engine bit-identical promise is made. No algorithm uses `Math.random()`.

The numerical tests check invariants and carefully selected cases; passing them is not proof of physical realism or exhaustive correctness for every possible terrain and parameter combination.
