export function createCache({ maxEntries = 512, maxWeight = Infinity, weightOf = () => 1 } = {}) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || !(maxWeight > 0)) {
    throw new RangeError('Cache limits must be positive');
  }
  const entries = new Map();
  let weight = 0;
  let hits = 0;
  let misses = 0;

  function getOrCreate(key, create) {
    if (entries.has(key)) {
      const entry = entries.get(key);
      entries.delete(key);
      entries.set(key, entry);
      hits++;
      return entry.value;
    }
    misses++;
    const value = create();
    const size = weightOf(value);
    if (!Number.isFinite(size) || size < 0) throw new RangeError('Cache weight must be finite and nonnegative');
    if (size > maxWeight) return value;
    entries.set(key, { value, size });
    weight += size;
    while (entries.size > maxEntries || weight > maxWeight) {
      const oldest = entries.keys().next().value;
      weight -= entries.get(oldest).size;
      entries.delete(oldest);
    }
    return value;
  }

  return {
    getOrCreate,
    clear() { entries.clear(); weight = 0; },
    getStats: () => ({ entries: entries.size, weight, hits, misses, maxEntries, maxWeight }),
  };
}