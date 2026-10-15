import { createRandom } from '../core/random.js';
import { noProgress, smoothHeightmap } from '../core/math.js';
import { createFeaturePoints } from './feature-points.js';

export function generateFaultTerrain(map, p, progress = noProgress) {
  const random = createRandom(p.seed);
  const working = new Float64Array(map.data.length);
  const center = map.size / 2;
  let displacement = p.displacement;
  for (let iteration = 0; iteration < p.iterations; iteration++) {
    const angle = random() * Math.PI * 2;
    const nx = Math.cos(angle), ny = Math.sin(angle);
    const offset = (random() * 2 - 1) * center * 0.9;
    const polarity = random() < 0.5 ? -1 : 1;
    for (let y = 0; y < map.height; y++) {
      let signedDistance = -nx * center + ny * (y * map.cellSize - center) - offset;
      for (let x = 0; x < map.width; x++, signedDistance += nx * map.cellSize) {
        const side = p.faultType === 'smooth'
          ? Math.tanh(signedDistance / Math.max(p.transitionWidth, 1e-6))
          : (signedDistance >= 0 ? 1 : -1);
        working[y * map.width + x] += polarity * displacement * side;
      }
    }
    displacement *= p.decay;
    if ((iteration & 3) === 0) progress((iteration + 1) / p.iterations);
  }
  map.data.set(working);
  progress(1);
  return map;
}

/**
 * Construct real finite Voronoi edges rather than using F2-F1 as a proxy.
 * For each site pair, clip its bisector to the square and all other cell
 * half-planes. Only neighboring plates retain a nonempty boundary segment.
 */
export function buildPlateBoundaries(points) {
  const edges = [];
  for (let a = 0; a < points.length; a++) {
    for (let b = a + 1; b < points.length; b++) {
      const pa = points[a], pb = points[b];
      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 1e-12) continue;
      const nx = dx / distance, ny = dy / distance;
      const tx = -ny, ty = nx;
      const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
      let low = -Infinity, high = Infinity, valid = true;
      // Every clipping condition is coefficient * t <= bound.
      const clip = (coefficient, bound) => {
        if (Math.abs(coefficient) < 1e-12) {
          if (bound < -1e-10) valid = false;
        } else if (coefficient > 0) high = Math.min(high, bound / coefficient);
        else low = Math.max(low, bound / coefficient);
      };
      clip(tx, 1 - mx); clip(-tx, mx); clip(ty, 1 - my); clip(-ty, my);
      for (let k = 0; k < points.length && valid; k++) {
        if (k === a || k === b) continue;
        const other = points[k];
        const ax = other.x - pa.x, ay = other.y - pa.y;
        clip(2 * (tx * ax + ty * ay), other.x ** 2 + other.y ** 2 - pa.x ** 2 - pa.y ** 2
          - 2 * (mx * ax + my * ay));
      }
      if (valid && high - low > 1e-8) {
        edges.push({ a, b, nx, ny, x1: mx + low * tx, y1: my + low * ty,
          x2: mx + high * tx, y2: my + high * ty });
      }
    }
  }
  return edges;
}

export function pointSegmentDistanceSquared(x, y, edge) {
  const dx = edge.x2 - edge.x1, dy = edge.y2 - edge.y1;
  const t = Math.max(0, Math.min(1, ((x - edge.x1) * dx + (y - edge.y1) * dy) / (dx * dx + dy * dy)));
  return (x - edge.x1 - t * dx) ** 2 + (y - edge.y1 - t * dy) ** 2;
}

/** Simplified procedural uplift model, NOT a crustal mechanics solver. */
export function generateTectonicTerrain(map, p, progress = noProgress) {
  const points = createFeaturePoints(p.plateCount, 0.95, p.seed);
  const random = createRandom(`${p.seed}:plate-motion`);
  for (const plate of points) {
    const angle = random() * Math.PI * 2;
    const speed = (0.5 + random() * 0.5) * p.motionStrength;
    plate.vx = Math.cos(angle) * speed; plate.vy = Math.sin(angle) * speed;
  }
  const edges = buildPlateBoundaries(points);
  for (const edge of edges) {
    const a = points[edge.a], b = points[edge.b];
    // Positive closing speed: each plate moves toward the other along the normal.
    const closingSpeed = (a.vx - b.vx) * edge.nx + (a.vy - b.vy) * edge.ny;
    edge.uplift = closingSpeed >= 0 ? closingSpeed * p.compression : closingSpeed * p.divergence;
  }
  const influence = p.boundaryWidth / map.size;
  const influenceSquared = influence * influence;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const u = x / (map.width - 1), v = y / (map.height - 1);
      let elevation = 0;
      for (const edge of edges) {
        const distanceSquared = pointSegmentDistanceSquared(u, v, edge);
        if (distanceSquared < 18 * influenceSquared) {
          elevation += edge.uplift * Math.exp(-distanceSquared / (2 * influenceSquared));
        }
      }
      map.data[y * map.width + x] = elevation;
    }
    if ((y & 7) === 0) progress(0.9 * y / (map.height - 1));
  }
  smoothHeightmap(map.data, map.width, map.height, p.smoothing);
  progress(1);
  return map;
}
