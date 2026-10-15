import { assertHeightmap, cloneHeightmap } from './heightmap.js';

/** Pure application state: importing this module does not require Three.js or a DOM. */
export class TerrainStore {
  constructor(historyLimit = 20) {
    this.baseHeightmap = null;
    this.currentHeightmap = null;
    this.history = [];
    this.operationLog = [];
    this.baseRecipe = null;
    this.historyLimit = historyLimit;
  }

  generate(map, recipe) {
    assertHeightmap(map);
    this.baseHeightmap = cloneHeightmap(map);
    this.currentHeightmap = cloneHeightmap(map);
    this.baseRecipe = structuredClone(recipe);
    this.history = [];
    this.operationLog = [];
  }

  /** Commit only a completed worker result; cancellation never consumes undo. */
  commitErosion(map, operation) {
    assertHeightmap(map);
    if (!this.currentHeightmap || map.width !== this.currentHeightmap.width
      || map.size !== this.currentHeightmap.size) throw new Error('Erosion changed map dimensions.');
    this.history.push({ map: this.currentHeightmap, logLength: this.operationLog.length });
    if (this.history.length > this.historyLimit) this.history.shift();
    this.currentHeightmap = cloneHeightmap(map);
    this.operationLog.push(structuredClone(operation));
  }

  undo() {
    const previous = this.history.pop();
    if (!previous) return false;
    this.currentHeightmap = previous.map;
    this.operationLog.length = previous.logLength;
    return true;
  }

  reset() {
    if (!this.baseHeightmap) return false;
    this.currentHeightmap = cloneHeightmap(this.baseHeightmap);
    this.history = [];
    this.operationLog = [];
    return true;
  }
}
