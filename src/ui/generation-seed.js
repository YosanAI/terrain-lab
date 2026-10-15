/** Randomness is used only to choose a recipe; the terrain algorithms stay seeded. */
export function createGenerationSeed(previous = '') {
  let seed;
  do {
    const words = crypto.getRandomValues(new Uint32Array(2));
    seed = `terrain-${Array.from(words, (word) => word.toString(36).padStart(7, '0')).join('-')}`;
  } while (seed === previous);
  return seed;
}
