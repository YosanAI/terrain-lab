import { createRandom, hashSeed, cellRandom } from '../core/random.js';

/** Stratification gives coverage, while jitter=1 allows motion throughout each cell. */
export function createFeaturePoints(count, jitter, seed) {
  const random = createRandom(seed);
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const cells = Array.from({ length: columns * rows }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const points = [];
  for (let i = 0; i < count; i++) {
    const column = cells[i] % columns, row = Math.floor(cells[i] / columns);
    points.push({
      x: (column + 0.5 + (random() - 0.5) * jitter) / columns,
      y: (row + 0.5 + (random() - 0.5) * jitter) / rows,
      elevation: random() * 2 - 1,
    });
  }
  return points;
}

/** A padded, deterministic lattice; density is sites per axis per noise-domain unit. */
export function createWorleyPoints(density, frequency, seed) {
  const points = [], hashedSeed = hashSeed(seed);
  const last = Math.ceil(frequency * density) + 2;
  for (let y = -2; y <= last; y++) {
    for (let x = -2; x <= last; x++) {
      points.push({
        x: (x + cellRandom(hashedSeed, x, y, 0)) / density,
        y: (y + cellRandom(hashedSeed, x, y, 1)) / density,
        elevation: 0,
      });
    }
  }
  return points;
}

/**
 * Shared, exact nearest-two lookup for Voronoi and Worley. A balanced k-d tree
 * avoids scanning every feature for every height sample. Search scratch is reused.
 */
export class FeatureIndex {
  constructor(points) {
    if (points.length < 2) throw new RangeError('At least two feature points are required.');
    this.points = points;
    const count = points.length;
    this.ids = new Int32Array(count);
    this.left = new Int32Array(count).fill(-1);
    this.right = new Int32Array(count).fill(-1);
    this.axis = new Uint8Array(count);
    let nextNode = 0;
    const build = (ids, depth) => {
      if (ids.length === 0) return -1;
      const axis = depth % 2, coordinate = axis ? 'y' : 'x';
      ids.sort((a, b) => points[a][coordinate] - points[b][coordinate] || a - b);
      const middle = Math.floor(ids.length / 2), node = nextNode++;
      this.ids[node] = ids[middle]; this.axis[node] = axis;
      this.left[node] = build(ids.slice(0, middle), depth + 1);
      this.right[node] = build(ids.slice(middle + 1), depth + 1);
      return node;
    };
    this.root = build(Array.from({ length: count }, (_, i) => i), 0);
    this.stack = new Int32Array(count);
    this.result = { first: -1, second: -1, distance1Squared: 0, distance2Squared: 0 };
  }

  nearestTwo(x, y) {
    let best = Infinity, secondBest = Infinity, firstId = -1, secondId = -1;
    let stackSize = 0;
    this.stack[stackSize++] = this.root;
    while (stackSize > 0) {
      const node = this.stack[--stackSize];
      const id = this.ids[node], point = this.points[id];
      const dx = x - point.x, dy = y - point.y, distance = dx * dx + dy * dy;
      if (distance < best || (distance === best && id < firstId)) {
        secondBest = best; secondId = firstId; best = distance; firstId = id;
      } else if (distance < secondBest || (distance === secondBest && id < secondId)) {
        secondBest = distance; secondId = id;
      }
      const offset = this.axis[node] ? dy : dx;
      const near = offset < 0 ? this.left[node] : this.right[node];
      const far = offset < 0 ? this.right[node] : this.left[node];
      if (far !== -1 && offset * offset <= secondBest) this.stack[stackSize++] = far;
      if (near !== -1) this.stack[stackSize++] = near;
    }
    this.result.first = firstId; this.result.second = secondId;
    this.result.distance1Squared = best; this.result.distance2Squared = secondBest;
    return this.result;
  }

  /** Distance to the closest supporting bisector of the winning Voronoi cell. */
  boundaryDistance(x, y, firstId, firstDistanceSquared) {
    const a = this.points[firstId];
    let distance = Infinity;
    for (let i = 0; i < this.points.length; i++) {
      if (i === firstId) continue;
      const b = this.points[i];
      const separation = Math.hypot(a.x - b.x, a.y - b.y);
      if (separation < 1e-12) continue;
      const otherDistance = (x - b.x) ** 2 + (y - b.y) ** 2;
      distance = Math.min(distance, Math.max(0, (otherDistance - firstDistanceSquared) / (2 * separation)));
    }
    return distance;
  }
}
