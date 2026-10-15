/** FNV-1a followed by integer avalanche; text and numeric seeds are supported. */
export function hashSeed(seed) {
  let hash = 2166136261;
  const text = String(seed);
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

/** Mulberry32: no Math.random() occurs in any terrain or erosion algorithm. */
export function createRandom(seed) {
  let state = hashSeed(seed);
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable cell hashing lets a Worley field retain its points when zoomed. */
export function cellRandom(seedHash, x, y, channel = 0) {
  let value = seedHash ^ Math.imul(x, 0x45d9f3b) ^ Math.imul(y, 0x119de1f3)
    ^ Math.imul(channel + 1, 0x27d4eb2d);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}
