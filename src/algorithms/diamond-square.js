import { createRandom } from '../core/random.js';
import { noProgress } from '../core/math.js';

export function generateDiamondSquare(map, p, progress = noProgress) {
  const last = map.width - 1;
  if ((last & (last - 1)) !== 0 || map.width !== map.height) {
    throw new RangeError('Diamond-square requires 2^n + 1 samples per side.');
  }
  const random = createRandom(p.seed);
  const heights = map.data, width = map.width;
  const displacement = (amplitude) => (random() * 2 - 1) * amplitude;
  heights[0] = displacement(p.cornerRange);
  heights[last] = displacement(p.cornerRange);
  heights[last * width] = displacement(p.cornerRange);
  heights[last * width + last] = displacement(p.cornerRange);
  let amplitude = p.displacement, level = 0;
  const levels = Math.log2(last);
  for (let step = last; step > 1; step /= 2) {
    const half = step / 2;
    // Diamond step: center of each square from its four corners.
    for (let y = half; y < last; y += step) {
      for (let x = half; x < last; x += step) {
        const mean = (heights[(y - half) * width + x - half] + heights[(y - half) * width + x + half]
          + heights[(y + half) * width + x - half] + heights[(y + half) * width + x + half]) / 4;
        heights[y * width + x] = mean + displacement(amplitude);
      }
    }
    // Square step: alternating midpoints; the non-periodic boundary uses 3 neighbors.
    for (let y = 0; y <= last; y += half) {
      for (let x = (y + half) % step; x <= last; x += step) {
        let total = 0, count = 0;
        if (x >= half) { total += heights[y * width + x - half]; count++; }
        if (x + half <= last) { total += heights[y * width + x + half]; count++; }
        if (y >= half) { total += heights[(y - half) * width + x]; count++; }
        if (y + half <= last) { total += heights[(y + half) * width + x]; count++; }
        heights[y * width + x] = total / count + displacement(amplitude);
      }
    }
    amplitude *= p.roughness;
    progress(++level / levels);
  }
  return map;
}
