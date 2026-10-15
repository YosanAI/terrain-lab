import { createFeaturePoints, createWorleyPoints, FeatureIndex } from './feature-points.js';
import { noProgress } from '../core/math.js';

/** Stable all-site interpolation, continuous through nearest-site changes. */
function blendedSiteHeight(points, u, v, minimumDistanceSquared, variance) {
  let totalWeight = 0, weightedHeight = 0;
  for (let site = 0; site < points.length; site++) {
    const point = points[site];
    const distanceSquared = (u - point.x) ** 2 + (v - point.y) ** 2;
    const weight = Math.exp(-(distanceSquared - minimumDistanceSquared) / (2 * variance));
    totalWeight += weight;
    weightedHeight += weight * point.elevation;
  }
  return weightedHeight / totalWeight;
}

export function generateVoronoi(map, p, progress = noProgress) {
  const points = createFeaturePoints(p.pointCount, p.jitter, p.seed);
  const index = new FeatureIndex(points);
  const nominalCellSize = 1 / Math.sqrt(points.length);
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const u = x / (map.width - 1), v = y / (map.height - 1);
      const nearest = index.nearestTwo(u, v);
      let elevation = points[nearest.first].elevation * p.variation;
      if (p.mode === 'smooth' && p.blending > 0) {
        // Soft nearest-site weights over ALL sites remain continuous even at
        // triple junctions. Subtracting d_min^2 avoids exponential underflow.
        const variance = (nominalCellSize * p.blending) ** 2;
        elevation = blendedSiteHeight(points, u, v, nearest.distance1Squared, variance) * p.variation;
      } else if (p.mode === 'ridges') {
        const distance = index.boundaryDistance(u, v, nearest.first, nearest.distance1Squared);
        const width = nominalCellSize * Math.max(0.015, p.blending);
        const ridge = Math.exp(-((distance / width) ** p.sharpness));
        // Smooth regional modulation avoids jumps where second-nearest sites switch.
        const regionalHeight = blendedSiteHeight(points, u, v, nearest.distance1Squared,
          (nominalCellSize * 0.75) ** 2);
        elevation = ridge * (1 + 0.5 * p.variation * regionalHeight);
      }
      map.data[y * map.width + x] = elevation * p.amplitude;
    }
    if ((y & 3) === 0) progress(y / (map.height - 1));
  }
  progress(1);
  return map;
}

export function generateWorley(map, p, progress = noProgress) {
  const points = createWorleyPoints(p.density, p.frequency, p.seed);
  const index = new FeatureIndex(points);
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const u = x / (map.width - 1) * p.frequency;
      const v = y / (map.height - 1) * p.frequency;
      const nearest = index.nearestTwo(u, v);
      const f1 = Math.sqrt(nearest.distance1Squared) * p.density;
      const f2 = Math.sqrt(nearest.distance2Squared) * p.density;
      const distance = p.distanceMode === 'f1' ? f1 : p.distanceMode === 'f2' ? f2 : Math.max(0, f2 - f1);
      map.data[y * map.width + x] = p.amplitude * distance ** p.exponent;
    }
    if ((y & 7) === 0) progress(y / (map.height - 1));
  }
  progress(1);
  return map;
}
