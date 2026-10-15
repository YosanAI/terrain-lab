import { HeightmapViewport } from './heightmap-viewport.js';

export async function createViewport(container, canvas) {
  try {
    const { TerrainViewport } = await import('./terrain-viewport.js');
    return new TerrainViewport(container, canvas);
  } catch (error) {
    return new HeightmapViewport(container, canvas, error.message);
  }
}
