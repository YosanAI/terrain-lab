import TerrainWorker from './terrain.worker.js?worker&inline';

/** One operation at a time, with cancellation by terminating the worker. */
export class WorkerClient {
  constructor() {
    this.worker = null;
    this.pending = null;
    this.sequence = 0;
  }

  run(job, progress) {
    if (this.pending) throw new Error('An operation is already running.');
    if (!this.worker) this.worker = new TerrainWorker();
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending = { id, reject };
      this.worker.onmessage = ({ data }) => {
        if (data.id !== id || !this.pending || this.pending.id !== id) return;
        if (data.type === 'progress') progress?.(data.fraction);
        else {
          this.pending = null;
          if (data.type === 'error') reject(new Error(data.message));
          else resolve(data);
        }
      };
      this.worker.onerror = (event) => {
        event.preventDefault();
        if (!this.pending || this.pending.id !== id) return;
        this.pending = null;
        this.worker.terminate(); this.worker = null;
        reject(new Error(event.message || 'Worker failed. Check browser support or file permissions.'));
      };
      const transfers = job.heightmap ? [job.heightmap.data.buffer] : [];
      try {
        this.worker.postMessage({ ...job, id }, transfers);
      } catch (error) {
        this.pending = null;
        this.worker.terminate(); this.worker = null;
        reject(error);
      }
    });
  }

  cancel() {
    if (!this.pending) return;
    const { reject } = this.pending;
    this.pending = null;
    this.worker?.terminate(); this.worker = null;
    reject(new DOMException('Operation canceled; terrain is unchanged.', 'AbortError'));
  }

  dispose() {
    this.cancel(); this.worker?.terminate(); this.worker = null;
  }
}
