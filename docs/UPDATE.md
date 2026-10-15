# Friendly controls update — 1.1.0

## Quick mode

The two main sections are **Generate terrain** and **Apply erosion**. Their
settings start collapsed, but their quick controls remain visible. Click the
**More settings** header (or focus it and press Enter / Space) to expand it.

Generate terrain shows only category, technique, and the blue Generate button.
Apply erosion shows three green buttons: hydraulic droplets, hydraulic grid
flow, and thermal erosion. Undo and Reset appear after an erosion operation.
The erosion settings expand further into individual algorithms.

## Seeds and live preview

Every successful Generate-button request chooses a fresh random text seed and
updates the seed field. The underlying algorithms are still deterministic.
Changing a category, technique, base parameter, seed, world size, or resolution
updates the base automatically after a short 180 ms pause. These edits keep the
current seed, so comparisons isolate the parameter change. Pasting an earlier
seed reproduces its terrain when all other generation settings match.

A new edit cancels obsolete generation work. Only the newest complete result
can be committed; old results and progress messages cannot overwrite it.
The visible terrain remains intact during work or cancellation. Invalid or
unfinished numeric entries never reach the simulation.

The camera is not reframed by ordinary live parameter edits. A new Generate
request, the first terrain, or a changed world size frames the terrain.
As before, generating a new base clears applied erosion and its undo history.

## Erosion and widgets

Erosion settings are **not live**: they take effect only when one of the Apply
buttons is clicked. Each operation builds on the current heightmap. Quick
buttons and the buttons inside advanced settings share exactly the same
parameter values and implementation.

All bounded numeric algorithm parameters now have native sliders paired with
exact-value inputs. No algorithm formulas, parameter defaults, numeric bounds,
heightmap architecture, or Three.js rendering code were changed in this update.
No new third-party dependency was added.

## Verification

44 Node tests and 74 Chromium UI/worker checks passed. The Chromium run used the
explicit 2D fallback, so it does not validate Three.js/WebGL. See VALIDATION.md
for the exact scope, reports, and remaining build checks.
