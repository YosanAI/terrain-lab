export const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const noProgress = () => {};

export function sum(values) {
  let total = 0;
  for (let i = 0; i < values.length; i++) total += values[i];
  return total;
}

/** Allocate once, then diffuse with simultaneous, symmetric neighbor exchange. */
export function smoothHeightmap(values, width, height, iterations, strength = 0.2) {
  const delta = new Float64Array(values.length);
  for (let iteration = 0; iteration < iterations; iteration++) {
    delta.fill(0);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (x + 1 < width) {
          const amount = (values[i] - values[i + 1]) * strength;
          delta[i] -= amount; delta[i + 1] += amount;
        }
        if (y + 1 < height) {
          const amount = (values[i] - values[i + width]) * strength;
          delta[i] -= amount; delta[i + width] += amount;
        }
      }
    }
    for (let i = 0; i < values.length; i++) values[i] += delta[i];
  }
}
