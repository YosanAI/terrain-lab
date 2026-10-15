# Validation record — friendly controls update (1.1.0)

## Executed for this update

| Check | Result | Evidence |
| --- | --- | --- |
| Algorithms, state, and live-generation scheduling | 44 tests passed, zero failures | `unit-tests.txt`; `npm test` |
| JavaScript syntax | Source, build scripts, and Node test modules passed `node --check` | Command below |
| Portable single-HTML packaging | Created successfully | `portable/terrain-laboratory.html`; `npm run build:portable` |
| Chromium UI and real Blob Worker | 74 checks passed, zero uncaught JavaScript exceptions | `browser-validation.json`; `tests/browser_regression.py` |
| Default-parameter CPU benchmark | All ten generators and all three erosion algorithms completed at 256 segments | `benchmark-256.json` |
| Algorithm preservation | `src/algorithms/`, `src/core/`, and `src/view/` files are byte-identical to the earlier delivered ZIP | Direct comparison during this update |
| Parameter compatibility | Numeric defaults, minimums, maximums, steps, and help text match the earlier delivered schema | Direct schema comparison |

The original 36 numerical/state cases remain in place. Eight additional Node
tests exercise debounce, immediate Generate, obsolete job cancellation, ignored
stale results/progress, already-resolved Promise races, cancellation without a
commit, worker-error recovery, and fresh text seeds.

The browser suite checks the compact default controls, keyboard expansion,
explicit settings affordances, fresh seed on every Generate, deterministic seed
replay, live parameter/size/resolution/category changes, linked sliders, invalid
input handling, parameter persistence, conditional controls, all ten generators,
manual erosion settings, collapsed quick-apply actions, cumulative erosion,
exact undo/reset, latest-result-only behavior, rapid Generate clicks, heavy-job
cancellation, 513 × 513 generation, exports, and desktop/mobile overflow.

## Boundary of these results

The actual browser backend in this test run was **Canvas2D**, with `FORCE_2D=1`
explicitly blocking the library CDN. The terrain algorithms, application code,
and Web Workers were real; no stub renderer was presented as Three.js. The 2D
fallback is visibly announced by the application. These checks do **not** verify
Three.js/WebGL rendering or GPU behavior. The Three.js rendering source itself
was not changed by this update.

The runtime could not resolve the package registry, and dependencies were not
installed. Consequently the **Vite production build and fully offline esbuild
export were not executed**. There is no generated dependency lockfile.

Direct browser navigation to `file://` was restricted by the runtime's browser
policy. Tests loaded the generated HTML contents through Playwright's
`set_content`, exercising the embedded application and actual classic Blob
worker. This checks that loaded document, not all browsers' local-file policies.

The delivered HTML is the CDN-assisted edition: Three.js and OrbitControls need
network access for 3D. `npm run build:single` is still the separate path for a
fully offline bundle after installing the dependencies. No publicly hosted URL
was deployed with this update.

## Reproduce the checks

```sh
npm test
npm run build:portable
npm run docs:parameters
npm run benchmark -- 256

find src scripts tests -type f \( -name '*.js' -o -name '*.mjs' \) -print0 \
  | xargs -0 -n1 node --check
```

Optional browser checks, not application dependencies:

```sh
python -m pip install playwright
python -m playwright install chromium
python tests/browser_regression.py
```

Use `CHROMIUM_EXECUTABLE` to select an existing Chromium executable. Set
`FORCE_2D=1` to explicitly exercise the fallback without depending on a CDN.
`HTML_PATH` can select another generated edition. The report, screenshots, and
sample exports are written to `.validation/`; the actual backend and loading
mode are recorded in the report.

For full local build verification:

```sh
npm install
npm run check
npm run dev
```

`check` runs Node tests, the Vite build, and the fully offline HTML export.
In a normal WebGL-capable browser, also verify camera orbit/zoom/pan, no camera
reset on live slider changes, mesh reuse and normal updates, wireframe, view
modes, high-resolution edits, resize, and erosion after changing terrain size.
The read-only `window.terrainLab.getRendererInfo()` should report `WebGL2`.

## Benchmark scope

The included benchmark is one Node.js run per algorithm with default settings
at 257 × 257 samples and size 256. It includes CPU allocation/computation, not
rendering, geometry updates, browser scheduling, or UI work. It is not a desktop
or phone performance guarantee. Maximum parameter settings can be much slower;
responsiveness comes from worker execution and cancellation rather than an
assumption that every computation is fast.
