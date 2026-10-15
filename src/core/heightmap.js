/**
 * @typedef {Object} Heightmap
 * @property {number} width Number of samples along X.
 * @property {number} height Number of samples along Z.
 * @property {number} size Horizontal extent in world units.
 * @property {number} cellSize Horizontal sample spacing, in world units.
 * @property {Float32Array} data Row-major elevations: data[z * width + x].
 */

export function createHeightmap(segments = 256, size = 256) {
  if (!Number.isInteger(segments) || segments < 2 || segments > 1024) {
    throw new RangeError('Segments must be an integer from 2 to 1024.');
  }
  if (!Number.isFinite(size) || size <= 0 || size > 100000) {
    throw new RangeError('Terrain size must be positive and at most 100000.');
  }
  return {
    width: segments + 1, height: segments + 1, size,
    cellSize: size / segments,
    data: new Float32Array((segments + 1) ** 2),
  };
}

export function cloneHeightmap(map) {
  return { ...map, data: map.data.slice() };
}

export function assertHeightmap(map) {
  if (!map || !(map.data instanceof Float32Array) || map.width !== map.height
    || !Number.isInteger(map.width) || map.width < 3 || map.width > 1025
    || map.data.length !== map.width * map.height
    || !Number.isFinite(map.size) || map.size <= 0 || map.size > 100000
    || !Number.isFinite(map.cellSize) || map.cellSize <= 0
    || Math.abs(map.cellSize - map.size / (map.width - 1)) > 1e-10 * map.cellSize) {
    throw new TypeError('Invalid square Float32 heightmap.');
  }
  for (let i = 0; i < map.data.length; i++) {
    if (!Number.isFinite(map.data[i])) throw new Error(`Non-finite elevation at sample ${i}.`);
  }
}

export function heightmapStatistics(map, base = null) {
  let minimum = Infinity, maximum = -Infinity, total = 0, squaredDifference = 0;
  for (let i = 0; i < map.data.length; i++) {
    const value = map.data[i];
    minimum = Math.min(minimum, value); maximum = Math.max(maximum, value); total += value;
    if (base) squaredDifference += (value - base.data[i]) ** 2;
  }
  return { minimum, maximum, mean: total / map.data.length, sum: total,
    rmsChange: base ? Math.sqrt(squaredDifference / map.data.length) : 0 };
}

/** Bilinear height and analytic derivatives. Output is reused by the caller. */
export function sampleHeightAndGradient(data, width, height, x, y, output, spacing = 1) {
  x = Math.max(0, Math.min(width - 1, x));
  y = Math.max(0, Math.min(height - 1, y));
  const ix = Math.min(width - 2, Math.floor(x));
  const iy = Math.min(height - 2, Math.floor(y));
  const tx = x - ix, ty = y - iy, i = iy * width + ix;
  const h00 = data[i], h10 = data[i + 1], h01 = data[i + width], h11 = data[i + width + 1];
  output.height = h00 * (1 - tx) * (1 - ty) + h10 * tx * (1 - ty)
    + h01 * (1 - tx) * ty + h11 * tx * ty;
  output.gradientX = ((h10 - h00) * (1 - ty) + (h11 - h01) * ty) / spacing;
  output.gradientY = ((h01 - h00) * (1 - tx) + (h11 - h10) * tx) / spacing;
  return output;
}

/** Weights sum to one, so amount is the sum of added sample heights. */
export function depositBilinear(data, width, height, x, y, amount) {
  const ix = Math.min(width - 2, Math.max(0, Math.floor(x)));
  const iy = Math.min(height - 2, Math.max(0, Math.floor(y)));
  const tx = Math.max(0, Math.min(1, x - ix)), ty = Math.max(0, Math.min(1, y - iy));
  const i = iy * width + ix;
  data[i] += amount * (1 - tx) * (1 - ty);
  data[i + 1] += amount * tx * (1 - ty);
  data[i + width] += amount * (1 - tx) * ty;
  data[i + width + 1] += amount * tx * ty;
}
