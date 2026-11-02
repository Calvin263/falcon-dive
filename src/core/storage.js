export function createStorage(getBackend = () => globalThis.localStorage) {
  return {
    read(key, fallback = null) {
      try {
        const value = getBackend().getItem(key);
        return value === null ? fallback : JSON.parse(value);
      } catch {
        return fallback;
      }
    },
    write(key, value) {
      try {
        getBackend().setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
  };
}