import test from 'node:test';
import assert from 'node:assert/strict';
import { createCache } from '../src/core/cache.js';

test('reuses values and evicts the least recently used entry', () => {
  const cache = createCache({ maxEntries: 2 });
  const first = cache.getOrCreate('first', () => ({}));
  cache.getOrCreate('second', () => ({}));
  assert.equal(cache.getOrCreate('first', () => assert.fail('cache miss')), first);
  cache.getOrCreate('third', () => ({}));
  let recreated = false;
  cache.getOrCreate('second', () => { recreated = true; return {}; });
  assert.equal(recreated, true);
  assert.equal(cache.getStats().entries, 2);
});

test('enforces a memory budget and does not retain oversized entries', () => {
  const cache = createCache({ maxWeight: 10, weightOf: value => value.bytes });
  cache.getOrCreate('first', () => ({ bytes: 6 }));
  cache.getOrCreate('second', () => ({ bytes: 6 }));
  assert.equal(cache.getStats().weight, 6);
  const large = cache.getOrCreate('large', () => ({ bytes: 20 }));
  assert.equal(large.bytes, 20);
  assert.equal(cache.getStats().entries, 1);
  cache.clear();
  assert.equal(cache.getStats().weight, 0);
});