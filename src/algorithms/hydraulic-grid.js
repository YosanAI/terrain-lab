import { noProgress, sum } from '../core/math.js';

/**
 * Eulerian four-neighbor finite-volume erosion. Flux is transferred water depth
 * per step (equal-area control cells); sediment is advected by donor concentration.
 * Closed borders conserve both water flow and solid material. This deliberately
 * uses a bounded diffusive surface-flow model, not full shallow-water dynamics.
 */
export function erodeGrid(map, p, progress = noProgress) {
  const width = map.width, height = map.height, count = map.data.length;
  const ground = new Float64Array(map.data);
  const water = new Float64Array(count);
  const waterAfterFlow = new Float64Array(count);
  let sediment = new Float64Array(count);
  let nextSediment = new Float64Array(count);
  // Order: west, east, north, south. Each entry is outgoing transferred depth.
  const flux = new Float64Array(count * 4);
  const neighbors = new Int32Array(count * 4).fill(-1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x, f = i * 4;
      if (x > 0) neighbors[f] = i - 1;
      if (x + 1 < width) neighbors[f + 1] = i + 1;
      if (y > 0) neighbors[f + 2] = i - width;
      if (y + 1 < height) neighbors[f + 3] = i + width;
    }
  }
  // In 2D a diffusion stencil requires alpha <= 1/4. Report clipping explicitly.
  const requestedConductance = p.flowRate * p.timeStep / (map.cellSize * map.cellSize);
  const conductance = Math.min(0.24, requestedConductance);
  const erosionFraction = Math.min(1, p.erosionRate * p.timeStep);
  const depositionFraction = Math.min(1, p.depositionRate * p.timeStep);
  const evaporationFactor = Math.max(0, 1 - p.evaporation * p.timeStep);
  const initialMass = sum(ground);
  let totalEroded = 0, totalDeposited = 0, evaporatedWater = 0;
  let minimumWater = Infinity, minimumSediment = Infinity;

  for (let iteration = 0; iteration < p.iterations; iteration++) {
    // Rainfall is depth per outer iteration, not per second.
    for (let i = 0; i < count; i++) water[i] += p.rainfall;
    flux.fill(0);
    for (let i = 0; i < count; i++) {
      const surface = ground[i] + water[i], f = i * 4;
      let outgoing = 0;
      for (let direction = 0; direction < 4; direction++) {
        const neighbor = neighbors[f + direction];
        if (neighbor === -1) continue;
        const transfer = conductance * Math.max(0, surface - ground[neighbor] - water[neighbor]);
        flux[f + direction] = transfer;
        outgoing += transfer;
      }
      // Positivity limiter: never send more water than this cell currently holds.
      const scale = outgoing > water[i] ? water[i] / outgoing : 1;
      for (let direction = 0; direction < 4; direction++) flux[f + direction] *= scale;
    }
    waterAfterFlow.set(water);
    for (let i = 0; i < count; i++) {
      const f = i * 4;
      for (let direction = 0; direction < 4; direction++) {
        const neighbor = neighbors[f + direction];
        if (neighbor === -1) continue;
        const transfer = flux[f + direction];
        waterAfterFlow[i] -= transfer;
        waterAfterFlow[neighbor] += transfer;
      }
    }
    // Exchange with the bed. Read slopes from a frozen bed for this time step.
    // nextSediment is reused as a ground delta buffer before the advection phase.
    nextSediment.fill(0);
    for (let i = 0; i < count; i++) {
      const f = i * 4;
      waterAfterFlow[i] = Math.max(0, waterAfterFlow[i]);
      let outgoing = 0, maximumDrop = 0;
      for (let direction = 0; direction < 4; direction++) {
        outgoing += flux[f + direction];
        const neighbor = neighbors[f + direction];
        if (neighbor !== -1) maximumDrop = Math.max(maximumDrop, ground[i] - ground[neighbor]);
      }
      const wetDepth = 0.5 * (water[i] + waterAfterFlow[i]);
      // Mean travel speed estimated from outgoing volume. It is explicitly bounded
      // by one grid spacing per timestep because the outflow fraction is <= 1.
      const movedFraction = water[i] > 1e-12 ? Math.min(1, outgoing / water[i]) : 0;
      const speed = movedFraction * map.cellSize / p.timeStep;
      const slope = maximumDrop / map.cellSize;
      const capacity = p.capacity * wetDepth * speed * slope;
      if (sediment[i] > capacity) {
        const amount = (sediment[i] - capacity) * depositionFraction;
        sediment[i] -= amount;
        nextSediment[i] += amount; totalDeposited += amount;
      } else if (wetDepth > 1e-12) {
        // Keep bed exchange small relative to the current downhill relief.
        const amount = Math.min((capacity - sediment[i]) * erosionFraction, maximumDrop * 0.2);
        sediment[i] += amount;
        nextSediment[i] -= amount; totalEroded += amount;
      }
    }
    for (let i = 0; i < count; i++) ground[i] += nextSediment[i];

    nextSediment.set(sediment);
    for (let i = 0; i < count; i++) {
      if (water[i] <= 1e-12 || sediment[i] <= 0) continue;
      const f = i * 4;
      const concentration = sediment[i] / water[i];
      // Donor-cell transport is conservative. Its outgoing sediment fraction
      // cannot exceed one because the same water positivity limiter is reused.
      for (let direction = 0; direction < 4; direction++) {
        const neighbor = neighbors[f + direction];
        if (neighbor === -1) continue;
        const transported = concentration * flux[f + direction];
        nextSediment[i] -= transported;
        nextSediment[neighbor] += transported;
      }
    }
    [sediment, nextSediment] = [nextSediment, sediment];
    for (let i = 0; i < count; i++) {
      // Only floating-point roundoff may reach these clamps.
      sediment[i] = Math.max(0, sediment[i]);
      water[i] = waterAfterFlow[i] * evaporationFactor;
      evaporatedWater += waterAfterFlow[i] - water[i];
      minimumWater = Math.min(minimumWater, water[i]);
      minimumSediment = Math.min(minimumSediment, sediment[i]);
      if (water[i] < 1e-10) {
        ground[i] += sediment[i]; totalDeposited += sediment[i]; sediment[i] = 0;
      }
    }
    if (iteration % Math.max(1, Math.floor(p.iterations / 100)) === 0) progress((iteration + 1) / p.iterations);
  }
  const suspendedBeforeSettling = sum(sediment);
  // A button press is a complete event: settle the remaining suspended load,
  // then discard water. Applying again starts dry on the modified terrain.
  for (let i = 0; i < count; i++) ground[i] += sediment[i];
  totalDeposited += suspendedBeforeSettling;
  map.data.set(ground);
  progress(1);
  const remainingWater = sum(water);
  return { totalEroded, totalDeposited, remainingWater, evaporatedWater,
    minimumWater, minimumSediment, suspendedBeforeSettling,
    conductance, requestedConductance, conductanceLimited: conductance < requestedConductance,
    waterBalanceError: remainingWater + evaporatedWater - p.rainfall * p.iterations * count,
    massError: sum(map.data) - initialMass,
    boundary: 'Closed; all suspended sediment settles at the end of each operation.' };
}
