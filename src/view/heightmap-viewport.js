import { heightmapStatistics } from '../core/heightmap.js';
import { clamp } from '../core/math.js';

/** Real 2D data inspection when WebGL or the CDN in the portable edition is unavailable. */
export class HeightmapViewport {
  constructor(container, canvas, reason = '') {
    this.container = container;
    this.mapCanvas = canvas;
    this.mapView = canvas.parentElement;
    this.mapView.hidden = false;
    this.baseRange = { minimum: 0, maximum: 1 };
    this.differenceRange = 0;
    this.is2DOnly = true;
    this.failureReason = reason;
    this.warning = '3D rendering could not start. Check WebGL support and internet access for the portable edition. All generation and erosion controls remain available in 2D heightmap mode.';
  }

  update(map, base, { newBase = false } = {}) {
    this.map = map;
    if (newBase) this.baseRange = heightmapStatistics(base);
    const canvas = this.mapCanvas;
    canvas.width = map.width; canvas.height = map.height;
    const context = canvas.getContext('2d');
    const image = context.createImageData(map.width, map.height);
    const range = Math.max(1e-8, this.baseRange.maximum - this.baseRange.minimum);
    for (let i = 0; i < map.data.length; i++) {
      const value = Math.round(clamp((map.data[i] - this.baseRange.minimum) / range, 0, 1) * 255);
      image.data[i * 4] = value; image.data[i * 4 + 1] = value; image.data[i * 4 + 2] = value; image.data[i * 4 + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }

  setMode() { this.mapView.hidden = false; }
  setWireframe() { /* A raster heightmap has no triangle wireframe. */ }
  frameTerrain() { /* The 2D canvas already fits its viewport. */ }
  dispose() { /* The browser owns the single 2D canvas. */ }
}
