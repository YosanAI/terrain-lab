/**
 * Debounced, latest-request-wins generation. This class has no DOM dependencies.
 * A slider can change while a worker is busy: cancel that obsolete job, keep the
 * visible terrain, and commit only the result matching the newest request.
 */
export class LiveGeneration {
  constructor({ run, cancel, onStart = () => {}, onProgress = () => {},
    onResult = () => {}, onError = () => {}, onStateChange = () => {}, delay = 180 }) {
    this.run = run;
    this.cancelWorker = cancel;
    this.onStart = onStart;
    this.onProgress = onProgress;
    this.onResult = onResult;
    this.onError = onError;
    this.onStateChange = onStateChange;
    this.delay = delay;
    this.revision = 0;
    this.timer = null;
    this.running = false;
  }

  get busy() { return this.timer !== null || this.running; }

  request(job, { immediate = false, ...options } = {}) {
    // Invalidate before cancellation: even an already-resolved older Promise
    // must not commit its result or clear the latest request's busy state.
    const revision = ++this.revision;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.running) this.cancelWorker();
    this.running = false;
    if (immediate) this.execute(job, options, revision);
    else {
      this.timer = setTimeout(() => this.execute(job, options, revision), this.delay);
      this.onStateChange();
    }
  }

  async execute(job, options, revision) {
    if (revision !== this.revision) return;
    this.timer = null;
    this.running = true;
    this.onStateChange();
    try {
      this.onStart(job);
      const result = await this.run(job, (fraction) => {
        if (revision === this.revision) this.onProgress(fraction, job);
      });
      if (revision === this.revision) this.onResult(result, job, options);
    } catch (error) {
      if (revision === this.revision) this.onError(error);
    } finally {
      if (revision === this.revision) {
        this.running = false;
        this.onStateChange();
      }
    }
  }

  cancel() {
    this.revision++;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.running) this.cancelWorker();
    this.running = false;
    this.onStateChange();
  }
}
