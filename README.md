# Procedural Terrain Laboratory

A vanilla JavaScript / Three.js / Vite engineering demo for generating heightfields, applying erosion, and comparing the results. No UI framework, terrain library, noise library, or physics library is used. Algorithms are implemented in the source and run in a Web Worker.

## Quick start

Use Node.js **20.19+ in the 20.x series, or 22.12+** and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). For a phone on the same trusted Wi-Fi network, use `npm run dev -- --host 0.0.0.0` and open the printed network address. Do not expose the development server to the public internet.

## Single HTML editions

**Included now:** `portable/terrain-laboratory.html`. Open it in a modern browser. All application code, terrain algorithms, CSS, and the classic worker are embedded. Only Three.js and OrbitControls load from the pinned jsDelivr CDN, so **3D needs internet access** in this edition. When the CDN or WebGL is unavailable, a clearly labeled **2D heightmap fallback** still runs the real generation and erosion algorithms. A file preview that disables JavaScript is not a browser runtime; open the file in the browser itself.

**Fully offline 3D export:** after installing the dependencies, run:

```sh
npm run build:single
```

The script bundles Three.js, OrbitControls, the worker, and all application code into `standalone/terrain-laboratory.html`, with no runtime CDN dependency. This export script is supplied, but was not executed in the delivery environment; see the validation section below.

Rebuild the smaller CDN-assisted HTML, without installing dependencies, using `npm run build:portable`.

## Use the lab

The **Generate terrain** and **Apply erosion** sections start in quick mode. The first shows category, technique, and a blue **Generate terrain** button; the second shows three green erosion buttons. Click **More settings** on either header to expand its configuration. The initial terrain is fBm on a 257 × 257 grid.

**Generate terrain picks a fresh random text seed on every click.** Selecting a category or technique, editing the seed, or changing any base parameter, terrain size, or resolution updates the terrain automatically after a short 180 ms pause. These live edits retain the current seed. Paste a previous seed to reproduce its terrain with the same parameters. A newer edit cancels obsolete worker computation; only the newest complete result is shown. Base controls remain usable while generating.

All bounded numeric parameters have native sliders and linked exact-value inputs. Ordinary live edits preserve the camera view; changing world size or clicking Generate frames the terrain. Any completed base generation replaces applied erosion and clears its history.

Click a hydraulic-droplet, hydraulic-grid, or thermal erosion button to apply it immediately. Expand **More settings** and then the desired erosion type for its parameters. **Erosion settings remain manual**: editing them does nothing until an Apply button is clicked. Operations accumulate on the current heightmap; **Undo Last Erosion** restores the exact previous array. Up to 20 snapshots are retained. **Reset to Base** restores the most recently generated base and clears erosion history. Undo and Reset are shown after erosion has been applied.

**Show base** is a nondestructive comparison. The 3D viewport offers height colors, neutral shading, grayscale, and signed change from base, plus wireframe and OrbitControls. A 2D grayscale view, height statistics, operation diagnostics, JSON height export, and PNG inspection export are also available. The base color range remains fixed during erosion so automatic recoloring cannot disguise changes.

Click **Fullscreen** beside **Frame terrain** to fill the screen with the scene and its view controls. Click **Exit fullscreen** or press **Esc** to return. Fullscreen preserves the current terrain and camera view, and works in both 3D and 2D modes when the browser supports fullscreen.

For a first comparison, generate ridged terrain, apply thermal erosion, inspect the signed-change view, undo, then try droplets instead. Start at 128 segments for very large iteration counts. Cancel stops the worker without committing a partial result.

## Implemented algorithms

| Family | Techniques |
| --- | --- |
| Gradient noise and fractals | Actual 2D Perlin; actual 2D Simplex; fBm; feedback-weighted ridged multifractal; coordinate-warped fBm / ridged terrain |
| Recursive subdivision | Diamond-square with separate diamond and square steps |
| Cellular and distance based | Voronoi cell heights / smooth cells / boundary ridges; Worley F1 / F2 / F2 − F1 |
| Geological | Repeated hard / smooth faults; moving Voronoi plates with convergent uplift and divergent depressions |
| Erosion | Particle hydraulic trajectories; Eulerian grid water / sediment fluxes; 4- or 8-neighbor talus redistribution |

The explanations and intentional simplifications are in [docs/ALGORITHMS.md](docs/ALGORITHMS.md). All defaults, accepted values, and parameter names are in [docs/PARAMETERS.md](docs/PARAMETERS.md), generated directly from the UI / validation schema.

## Libraries

| Third-party library | Version pinned here | Purpose |
| --- | --- | --- |
| Three.js | 0.180.0 | WebGL terrain mesh, camera, lighting, materials, geometry buffers |
| OrbitControls | Included with Three.js 0.180.0 | Rotate, zoom, and pan; not a separate npm dependency |
| Vite | 7.1.7, development only | Development server and standard production build |
| esbuild | 0.25.10, development only | Single-file, fully offline packaging script |

Native browser APIs provide DOM controls, Canvas2D inspection, Workers, Blob downloads, and typed arrays. Tests use Node's built-in test runner. Python Playwright was used externally for browser verification and is not an application dependency. The npm packages above have their own transitive development dependencies; there are no additional third-party algorithm libraries.

## Build, test, and deploy

```sh
npm test                  # Pure algorithms and state; no npm packages needed
npm run benchmark -- 256  # CPU-only timings with the shipped default parameters
npm run build             # Standard static output in dist/
npm run preview           # Serve the production output locally
npm run build:single      # Fully offline, single HTML after npm install
npm run build:portable    # CDN-assisted single HTML; no npm packages needed
npm run docs:parameters   # Regenerate the parameter reference
```

The Vite config uses relative asset paths. Deploy `dist/` to a static host after a successful build. No backend, database, API key, or user account is required by the application. **No public demo URL was deployed with this delivery.**

## Validation status

**Passed:** 44 Node algorithm / state / live-scheduler tests, source syntax checks, and 74 Chromium UI / worker checks using the explicit 2D fallback. The browser checks include collapsed/expanded controls, fresh seeds, deterministic seed replay, live changes, rapid-edit cancellation and latest-result commits, all generators, cumulative erosion, exact undo/reset, 513 × 513 generation, exports, and mobile layout. Reports and a CPU benchmark are included under `docs/`. See [docs/UPDATE.md](docs/UPDATE.md) for the UI update summary.

**Not verified here:** package installation, the Vite production build, the esbuild fully offline export, and actual Three.js / WebGL rendering. External dependencies were unavailable in the execution environment; the browser regression run explicitly forced the 2D fallback. The delivered portable HTML was built and tested using embedded application code plus the 2D fallback; that is not a claim of 3D validation. Run `npm install` followed by `npm run check` to complete build verification locally.

See [docs/VALIDATION.md](docs/VALIDATION.md) for precise scope and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for module responsibilities and the data / worker interfaces.
