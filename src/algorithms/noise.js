import { createRandom } from '../core/random.js';
import { clamp, lerp, noProgress } from '../core/math.js';

const DIAGONAL = Math.SQRT1_2;
const PERLIN_GRADIENTS = [[1, 0], [-1, 0], [0, 1], [0, -1],
  [DIAGONAL, DIAGONAL], [-DIAGONAL, DIAGONAL], [DIAGONAL, -DIAGONAL], [-DIAGONAL, -DIAGONAL]];
const SIMPLEX_GRADIENTS = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0],
  [1, 0], [-1, 0], [0, 1], [0, -1], [0, 1], [0, -1]];
const F2 = (Math.sqrt(3) - 1) / 2;
const G2 = (3 - Math.sqrt(3)) / 6;
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function permutation(seed) {
  const random = createRandom(seed);
  const source = Array.from({ length: 256 }, (_, index) => index);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [source[i], source[j]] = [source[j], source[i]];
  }
  const result = new Uint16Array(512);
  for (let i = 0; i < 512; i++) result[i] = source[i & 255];
  return result;
}

/** Classic grid-corner gradient noise, using Perlin's improved quintic fade. */
export function createPerlinNoise(seed) {
  const perm = permutation(seed);
  function gradientDot(hash, x, y) {
    const gradient = PERLIN_GRADIENTS[hash & 7];
    return gradient[0] * x + gradient[1] * y;
  }
  return (x, y) => {
    const floorX = Math.floor(x), floorY = Math.floor(y);
    const ix = floorX & 255, iy = floorY & 255;
    const tx = x - floorX, ty = y - floorY;
    const bottom = lerp(gradientDot(perm[ix + perm[iy]], tx, ty),
      gradientDot(perm[ix + 1 + perm[iy]], tx - 1, ty), fade(tx));
    const top = lerp(gradientDot(perm[ix + perm[iy + 1]], tx, ty - 1),
      gradientDot(perm[ix + 1 + perm[iy + 1]], tx - 1, ty - 1), fade(tx));
    return Math.SQRT2 * lerp(bottom, top, fade(ty));
  };
}

/** True 2D simplex lattice: skew, choose triangle, sum three compact kernels. */
export function createSimplexNoise(seed) {
  const perm = permutation(seed);
  function contribution(hash, x, y) {
    const radius = 0.5 - x * x - y * y;
    if (radius <= 0) return 0;
    const gradient = SIMPLEX_GRADIENTS[hash % 12];
    return radius ** 4 * (gradient[0] * x + gradient[1] * y);
  }
  return (x, y) => {
    const skew = (x + y) * F2;
    const i = Math.floor(x + skew), j = Math.floor(y + skew);
    const unskew = (i + j) * G2;
    const x0 = x - (i - unskew), y0 = y - (j - unskew);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const ii = i & 255, jj = j & 255;
    return 70 * (contribution(perm[ii + perm[jj]], x0, y0)
      + contribution(perm[ii + i1 + perm[jj + j1]], x0 - i1 + G2, y0 - j1 + G2)
      + contribution(perm[ii + 1 + perm[jj + 1]], x0 - 1 + 2 * G2, y0 - 1 + 2 * G2));
  };
}

export const createNoise = (type, seed) => type === 'simplex' ? createSimplexNoise(seed) : createPerlinNoise(seed);

export function fractalNoise(noise, x, y, octaves, lacunarity, persistence) {
  let value = 0, weight = 1, weightSum = 0;
  for (let octave = 0; octave < octaves; octave++) {
    value += noise(x, y) * weight;
    weightSum += weight;
    x *= lacunarity; y *= lacunarity; weight *= persistence;
  }
  return value / weightSum;
}

export function ridgedNoise(noise, x, y, octaves, lacunarity, persistence, sharpness = 2, gain = 2) {
  let value = 0, weight = 1, weightSum = 0, feedback = 1;
  for (let octave = 0; octave < octaves; octave++) {
    // Feedback suppresses small ridges where the preceding octave had valleys.
    const ridge = Math.max(0, 1 - Math.abs(noise(x, y))) ** sharpness * feedback;
    value += ridge * weight;
    weightSum += weight;
    feedback = clamp(ridge * gain, 0, 1);
    x *= lacunarity; y *= lacunarity; weight *= persistence;
  }
  return value / weightSum;
}

export function generateNoiseTerrain(map, parameters, progress = noProgress) {
  const p = parameters;
  const noise = createNoise(p.baseNoise ?? p.algorithm, p.seed);
  const warpX = p.algorithm === 'warp' ? createNoise(p.baseNoise, `${p.seed}:warp-x`) : null;
  const warpY = p.algorithm === 'warp' ? createNoise(p.baseNoise, `${p.seed}:warp-y`) : null;
  const frequency = p.frequency;
  for (let z = 0; z < map.height; z++) {
    for (let x = 0; x < map.width; x++) {
      let u = x / (map.width - 1), v = z / (map.height - 1);
      if (p.algorithm === 'warp') {
        // Both displacements read the original coordinate, not one another.
        const qx = fractalNoise(warpX, u * p.warpFrequency + 13.17, v * p.warpFrequency + 47.91,
          p.warpOctaves, p.lacunarity, p.persistence);
        const qy = fractalNoise(warpY, u * p.warpFrequency + 31.43, v * p.warpFrequency + 19.71,
          p.warpOctaves, p.lacunarity, p.persistence);
        u += p.warpStrength * qx;
        v += p.warpStrength * qy;
      }
      const sx = u * frequency + 13.17, sy = v * frequency + 47.91;
      let value;
      if (p.algorithm === 'perlin' || p.algorithm === 'simplex') value = noise(sx, sy);
      else if (p.algorithm === 'ridged' || (p.algorithm === 'warp' && p.warpMode === 'ridged')) {
        value = ridgedNoise(noise, sx, sy, p.octaves, p.lacunarity, p.persistence, p.sharpness, p.gain);
      } else value = fractalNoise(noise, sx, sy, p.octaves, p.lacunarity, p.persistence);
      map.data[z * map.width + x] = value * p.amplitude;
    }
    if ((z & 7) === 0) progress(z / (map.height - 1));
  }
  progress(1);
  return map;
}
