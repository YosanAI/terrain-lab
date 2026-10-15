# Architecture

## Module responsibilities

```text
src/
  main.js                         Application wiring, transactions, exports
  style.css                       Minimal native-control layout
  core/
    heightmap.js                  Float32 map creation, validation, sampling, statistics
    terrain-store.js              Saved base, current map, undo snapshots, operation log
    random.js                     Seed hashing, PRNG, coordinate hashing
    math.js                       Small shared numeric helpers
  algorithms/
    index.js                      Validated generation / erosion interfaces
    noise.js                      Perlin, Simplex, octave composition, coordinate warping
    diamond-square.js             Alternating midpoint subdivision
    feature-points.js             Seeded sites, exact nearest-two k-d tree, boundary distance
    cellular.js                   Voronoi modes and Worley distances
    geological.js                 Fault iteration and clipped moving-plate boundaries
    hydraulic-droplet.js          Bilinear particle trajectories and sediment brushes
    hydraulic-grid.js             Eulerian water / sediment fluxes
    thermal.js                    Talus-based simultaneous redistribution
  workers/
    terrain.worker.js             Job protocol, progress, computation timing, transferred result
    worker-client.js              Pending job, transfer of a copy, cancellation / errors
  ui/
    parameters.js                 Definitions shared by UI, validation, and generated docs
    parameter-controls.js         Native controls, linked slider/number input, conditional visibility
    accordions.js                 Accessible expanders with persistent quick controls
    generation-seed.js            Fresh text seed for explicit Generate requests
    live-generation.js            Debounce, cancellation, latest-result-only generation
  view/
    terrain-viewport.js           Real Three.js rendering; independent of algorithms
    heightmap-viewport.js         Explicit Canvas2D fallback, not a replacement 3D engine
    create-viewport.js            Dynamically starts Three.js, catches renderer loading failure
```

No algorithm imports Three.js, the DOM, Vite, or a UI library. The parameter module is a data schema; its location under `ui/` does not make it DOM-dependent.

## Data interface

```js
const map = {
  width: 257,
  height: 257,
  size: 256,
  cellSize: 1,
  data: new Float32Array(257 * 257), // data[z * width + x]; height along Y
};
```

Erosion may produce negative ground elevations; negative water or suspended sediment is not allowed. A terrain height of zero is not a bedrock constraint or automatic sea level.

The public pure-computation interfaces are:

```js
import { generateTerrain, applyErosion } from './src/algorithms/index.js';
import { cloneHeightmap } from './src/core/heightmap.js';

const { map: base } = generateTerrain(
  'fbm',
  { seed: 'demo', baseNoise: 'simplex', octaves: 6, amplitude: 60 },
  { segments: 256, size: 256 },
  fraction => console.log(fraction),
);
const working = cloneHeightmap(base);
const { map: eroded, diagnostics } = applyErosion(
  'thermal', working,
  { talusAngle: 30, iterations: 100, transportRate: 0.6, neighborhood: '8' },
);
```

Missing individual parameters use the schema defaults. `generateTerrain` creates a new map; `applyErosion` modifies the provided map and returns it along with validated parameters and diagnostics. Lower-level generator functions receive an allocated map, validated parameters, and an optional progress callback. They fill the map rather than allocating Three.js objects.

## Transactions and history

A successful generation clones its result into separate `baseHeightmap` and `currentHeightmap` buffers, stores the recipe, and clears history. Erosion sends a **clone** of the current map to the worker. Only the clone is transferred / detached. On successful completion, the store retains the previous immutable current map as an undo snapshot and commits the completed result. No partial result is committed.

This order provides the user-visible behavior of saving the prior state before erosion while avoiding a spurious undo entry when a job fails or is canceled. Cancel terminates the worker and rejects the job. The next operation creates a fresh worker. The saved base never travels as a transferable buffer.

Up to 20 snapshots are retained, with the full current operation log kept separately. Undo restores a previous array exactly and trims the operation log to that point. Reset clones the base and clears both history and the erosion log. Generating again replaces the base. The Show base control changes only the rendered source.

## Quick controls, live generation, and concurrency

Each main accordion collapses only its advanced settings region, leaving the
quick controls accessible. Native buttons expose `aria-expanded` and
`aria-controls`; erosion-specific configuration uses native `details` elements.
Both quick and expanded erosion Apply buttons use the same parameter controls.

`generation-seed.js` uses browser random values only to choose a new recipe seed
for an explicit Generate request. Live edits do not choose a new seed. The pure
noise and erosion implementations still use deterministic seeded randomness.

`LiveGeneration` has no DOM dependency. It captures validated recipes, debounces
live edits for 180 ms, and immediately starts explicit Generate requests. Each
request has a monotonically increasing revision. A newer edit cancels running
generation and invalidates any older Promise result, progress event, or error.
Only the latest complete result may update the store. This also handles an old
Promise that resolved just before a new input event but has not committed yet.

The main thread keeps base inputs enabled during generation, but disables
conflicting erosion/history operations. While erosion is running, base inputs
are also disabled. Erosion never automatically restarts on a parameter edit.
Cancel preserves the existing map and history. Invalid or incomplete values
cancel any queued preview and preserve the current terrain. Inputs retain their
draft values after cancellation, while the viewport label and exports continue
to identify the actual displayed recipe.

Completed live base edits clear erosion history just like an explicit Generate.
They preserve the camera unless world size changes. The initial terrain and
explicit Generate requests are framed. No rendering or simulation algorithms
were changed for the compact UI.

## Worker protocol and performance

Requests contain an id, action (`generate` or `erode`), algorithm name, parameters, and either grid settings or an input heightmap. Responses contain matching ids and progress, an error, or a completed map / diagnostics / computation time. Result buffers use transfer lists.

Algorithms reuse scratch typed arrays and use periodic, throttled progress messages. A worker can still take a long time for maximum settings; nonblocking execution is not a claim that every parameter combination is fast. Renderer updates occur once per completed operation and reuse the geometry when the vertex count is unchanged. Vertex normals and bounds are recomputed after height edits. OrbitControls renders on change rather than running an idle animation loop. Pixel ratio is capped at 1.5 for the demo.

Memory grows with sample count, undo depth, and the selected solver. Grid hydraulic erosion retains several per-cell Float64 buffers and four directional fluxes. There is no WebGPU or GPU erosion path; one readable CPU reference is intentional.

## Packaging

Vite imports the worker through `?worker&inline`. The standard build uses Vite's worker pipeline and bundles its assets. The fully offline HTML script uses esbuild twice: first for a classic worker, then for the app plus Three.js. The worker is created from an embedded Blob.

The delivered CDN-assisted HTML uses a separate, dependency-free packager for this project's own module subset. Its worker is an embedded classic IIFE because importing nested Blob modules from a module worker can fail on opaque local-file origins. The main application uses native Blob ES modules and pinned CDN imports for Three.js / OrbitControls. The small packaging linker is intentionally limited to the named imports / exports used here; it is not a general JavaScript bundler. Use Vite / esbuild when extending the application to arbitrary module syntax.

No files are uploaded by the application. Exports are generated locally in the browser. The CDN-assisted edition makes external library requests; the bundled offline edition does not.

## Official API references

- Three.js PlaneGeometry: https://threejs.org/docs/pages/PlaneGeometry.html
- Three.js OrbitControls: https://threejs.org/docs/pages/OrbitControls.html
- Vite setup and build commands: https://vite.dev/guide/
- esbuild bundling API: https://esbuild.github.io/api/#bundle

The mathematical descriptions in `ALGORITHMS.md` describe this project's implementation and its simplifications, not a claim that the hydraulic or tectonic code reproduces a specific physical solver.
