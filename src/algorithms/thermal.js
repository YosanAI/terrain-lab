import { noProgress, sum } from '../core/math.js';

const FOUR_NEIGHBORS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const EIGHT_NEIGHBORS = [...FOUR_NEIGHBORS, [-1, -1], [1, -1], [-1, 1], [1, 1]];

export function erodeThermal(map, p, progress = noProgress) {
  const ground = new Float64Array(map.data);
  const delta = new Float64Array(ground.length);
  const initialMass = sum(ground);
  const offsets = p.neighborhood === '8' ? EIGHT_NEIGHBORS : FOUR_NEIGHBORS;
  const tangent = Math.tan(p.talusAngle * Math.PI / 180);
  const thresholds = offsets.map(([x, y]) => tangent * map.cellSize * Math.hypot(x, y));
  // Degree-normalized pair exchange is a stable diffusion step at zero talus.
  const exchangeFactor = p.transportRate / (2 * offsets.length);
  let totalTransferred = 0;
  for (let iteration = 0; iteration < p.iterations; iteration++) {
    delta.fill(0);
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const index = y * map.width + x;
        for (let direction = 0; direction < offsets.length; direction++) {
          const nx = x + offsets[direction][0], ny = y + offsets[direction][1];
          if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue;
          const neighbor = ny * map.width + nx;
          const excess = ground[index] - ground[neighbor] - thresholds[direction];
          if (excess <= 0) continue;
          const amount = excess * exchangeFactor;
          delta[index] -= amount; delta[neighbor] += amount;
          totalTransferred += amount;
        }
      }
    }
    // All moves are committed together, independent of traversal order.
    for (let i = 0; i < ground.length; i++) ground[i] += delta[i];
    if (iteration % Math.max(1, Math.floor(p.iterations / 100)) === 0) progress((iteration + 1) / p.iterations);
  }
  map.data.set(ground);
  progress(1);
  return { totalTransferred, massError: sum(map.data) - initialMass,
    boundary: 'Closed; pairwise redistribution conserves material.' };
}
