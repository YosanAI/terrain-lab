import { createRandom } from '../core/random.js';
import { sampleHeightAndGradient, depositBilinear } from '../core/heightmap.js';
import { noProgress, sum } from '../core/math.js';

function makeErosionBrush(radius) {
  const offsets = [];
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      const weight = Math.max(0, radius - Math.hypot(x, y));
      if (weight > 0) offsets.push({ x, y, weight });
    }
  }
  return offsets;
}

/** Removes material with a normalized radial footprint and a downstream floor. */
function erodeBrush(data, width, height, x, y, requested, downstreamHeight, brush) {
  const centerX = Math.round(x), centerY = Math.round(y);
  let weightSum = 0;
  for (let j = 0; j < brush.length; j++) {
    const offset = brush[j], px = centerX + offset.x, py = centerY + offset.y;
    if (px >= 0 && px < width && py >= 0 && py < height) weightSum += offset.weight;
  }
  let removed = 0;
  for (let j = 0; j < brush.length; j++) {
    const offset = brush[j], px = centerX + offset.x, py = centerY + offset.y;
    if (px < 0 || px >= width || py < 0 || py >= height) continue;
    const index = py * width + px;
    // Do not excavate this brush sample beneath the receiving surface.
    const available = Math.max(0, data[index] - downstreamHeight);
    const amount = Math.min(available, requested * offset.weight / weightSum);
    data[index] -= amount;
    removed += amount;
  }
  return removed;
}

/** Particle hydraulic erosion. map.data is committed once, after Float64 work. */
export function erodeDroplets(map, p, progress = noProgress) {
  const data = new Float64Array(map.data), width = map.width, height = map.height;
  const random = createRandom(p.seed);
  const brush = makeErosionBrush(p.radius);
  const sample = { height: 0, gradientX: 0, gradientY: 0 };
  const nextSample = { height: 0, gradientX: 0, gradientY: 0 };
  const initialMass = sum(data);
  let exportedSediment = 0, totalEroded = 0, totalDeposited = 0, totalSteps = 0;
  const progressInterval = Math.max(1, Math.floor(p.droplets / 100));

  for (let droplet = 0; droplet < p.droplets; droplet++) {
    let x = random() * (width - 1 - 1e-6), y = random() * (height - 1 - 1e-6);
    let directionX = 0, directionY = 0, speed = 1, water = 1, sediment = 0;
    let exited = false;
    for (let lifetime = 0; lifetime < p.lifetime; lifetime++) {
      totalSteps++;
      sampleHeightAndGradient(data, width, height, x, y, sample, map.cellSize);
      directionX = p.inertia * directionX - (1 - p.inertia) * sample.gradientX;
      directionY = p.inertia * directionY - (1 - p.inertia) * sample.gradientY;
      const directionLength = Math.hypot(directionX, directionY);
      if (directionLength < 1e-10) break;
      directionX /= directionLength; directionY /= directionLength;
      // One sample spacing per trajectory step; positions are grid coordinates.
      const nextX = x + directionX, nextY = y + directionY;
      if (nextX < 0 || nextX >= width - 1 || nextY < 0 || nextY >= height - 1) {
        exportedSediment += sediment;
        sediment = 0; exited = true; break;
      }
      sampleHeightAndGradient(data, width, height, nextX, nextY, nextSample, map.cellSize);
      const heightDifference = nextSample.height - sample.height;
      const downhillSlope = Math.max(0, -heightDifference / map.cellSize);
      const capacity = Math.max(downhillSlope * speed * water * p.capacity,
        p.minimumCapacity * water);

      if (heightDifference > 0 || sediment > capacity) {
        const amount = heightDifference > 0
          ? Math.min(sediment, heightDifference)
          : (sediment - capacity) * p.depositionRate;
        depositBilinear(data, width, height, x, y, amount);
        sediment -= amount; totalDeposited += amount;
      } else {
        // This downhill cap and the brush floor limit deep single-step pits.
        const requested = Math.min((capacity - sediment) * p.erosionRate, Math.max(0, -heightDifference));
        if (requested > 0) {
          const removed = erodeBrush(data, width, height, x, y, requested, nextSample.height, brush);
          sediment += removed; totalEroded += removed;
        }
      }
      speed = Math.sqrt(Math.max(0, speed * speed - 2 * p.gravity * heightDifference));
      water *= 1 - p.evaporation;
      x = nextX; y = nextY;
      if (water < 0.01 || speed < 1e-6) break;
    }
    // Interior termination deposits the load; open edges explicitly export it.
    if (!exited && sediment > 0) {
      depositBilinear(data, width, height, x, y, sediment);
      totalDeposited += sediment;
    }
    if (droplet % progressInterval === 0) progress((droplet + 1) / p.droplets);
  }
  map.data.set(data);
  progress(1);
  return { totalEroded, totalDeposited, exportedSediment, totalSteps,
    massError: sum(map.data) + exportedSediment - initialMass,
    boundary: 'Open; sediment carried out of the map is recorded as export.' };
}
