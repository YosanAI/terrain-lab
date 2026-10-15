import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { LiveGeneration } from '../src/ui/live-generation.js';
import { createGenerationSeed } from '../src/ui/generation-seed.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(delay = 5) {
  const jobs = [], results = [], errors = [], progress = [], busyStates = [];
  let cancels = 0;
  const scheduler = new LiveGeneration({
    delay,
    run: (job, report) => {
      const pending = { job, report, ...deferred() };
      jobs.push(pending); return pending.promise;
    },
    cancel: () => { cancels++; },
    onProgress: (value, job) => progress.push([value, job.id]),
    onResult: (result, job, options) => results.push({ result, job, options }),
    onError: (error) => errors.push(error),
    onStateChange: () => busyStates.push(scheduler.busy),
  });
  return { scheduler, jobs, results, errors, progress, busyStates, get cancels() { return cancels; } };
}

test('Live generation coalesces a burst of slider edits into the latest recipe', async () => {
  const h = harness();
  h.scheduler.request({ id: 1 }); h.scheduler.request({ id: 2 }); h.scheduler.request({ id: 3 });
  assert.equal(h.scheduler.busy, true);
  assert.equal(h.jobs.length, 0);
  await wait(20);
  assert.deepEqual(h.jobs.map(({ job }) => job.id), [3]);
  h.jobs[0].resolve('terrain-3'); await wait(0);
  assert.equal(h.results[0].result, 'terrain-3');
  assert.equal(h.scheduler.busy, false);
});

test('New live request cancels running generation and ignores its late progress/result', async () => {
  const h = harness();
  h.scheduler.request({ id: 1 }, { immediate: true });
  h.scheduler.request({ id: 2 }, { immediate: true, frame: false });
  assert.equal(h.cancels, 1);
  h.jobs[0].report(0.8); h.jobs[0].resolve('stale'); await wait(0);
  assert.equal(h.results.length, 0); assert.equal(h.progress.length, 0);
  assert.equal(h.scheduler.busy, true);
  h.jobs[1].report(0.5); h.jobs[1].resolve('current'); await wait(0);
  assert.deepEqual(h.progress, [[0.5, 2]]);
  assert.equal(h.results[0].result, 'current');
  assert.equal(h.results[0].options.frame, false);
});

test('A completed-but-not-yet-committed old Promise cannot replace a newer request', async () => {
  const h = harness();
  h.scheduler.request({ id: 1 }, { immediate: true });
  h.jobs[0].resolve('old');
  h.scheduler.request({ id: 2 }, { immediate: true });
  await wait(0);
  assert.equal(h.results.length, 0); assert.equal(h.scheduler.busy, true);
  h.jobs[1].resolve('new'); await wait(0);
  assert.equal(h.results.length, 1); assert.equal(h.results[0].result, 'new');
});

test('Generate starts immediately and supersedes a queued live edit', async () => {
  const h = harness();
  h.scheduler.request({ id: 'slider' });
  h.scheduler.request({ id: 'button' }, { immediate: true, frame: true });
  assert.equal(h.jobs.length, 1); assert.equal(h.jobs[0].job.id, 'button');
  await wait(20); assert.equal(h.jobs.length, 1);
  h.jobs[0].resolve('new-seed-map'); await wait(0);
  assert.equal(h.results[0].options.frame, true);
});

test('Cancel during debounce prevents the worker job entirely', async () => {
  const h = harness(); h.scheduler.request({ id: 1 }); h.scheduler.cancel();
  await wait(20);
  assert.equal(h.jobs.length, 0); assert.equal(h.results.length, 0);
  assert.equal(h.scheduler.busy, false); assert.equal(h.cancels, 0);
});

test('Cancel during computation leaves results untouched and permits a later generation', async () => {
  const h = harness();
  h.scheduler.request({ id: 1 }, { immediate: true }); h.scheduler.cancel();
  h.jobs[0].reject(new Error('obsolete')); await wait(0);
  assert.equal(h.errors.length, 0); assert.equal(h.scheduler.busy, false);
  h.scheduler.request({ id: 2 }, { immediate: true });
  h.jobs[1].resolve('recovered'); await wait(0);
  assert.equal(h.results[0].result, 'recovered');
});

test('A worker error is reported, clears busy state, and does not commit a result', async () => {
  const h = harness(); h.scheduler.request({ id: 1 }, { immediate: true });
  h.jobs[0].reject(new Error('worker failed')); await wait(0);
  assert.equal(h.errors[0].message, 'worker failed');
  assert.equal(h.results.length, 0); assert.equal(h.scheduler.busy, false);
});

test('Fresh generation seeds are text, distinct, and within the editable seed limit', () => {
  const seeds = new Set(); let previous = '';
  for (let i = 0; i < 100; i++) {
    const seed = createGenerationSeed(previous);
    assert.match(seed, /^terrain-[0-9a-z]{7}-[0-9a-z]{7}$/);
    assert.notEqual(seed, previous); assert.ok(seed.length <= 128);
    previous = seed; seeds.add(seed);
  }
  assert.equal(seeds.size, 100);
});
