/**
 * Tiny IndexedDB key-value cache. Every operation is best-effort: if storage is unavailable
 * (private mode, blocked, quota), reads return undefined and writes do nothing.
 */
const DB_NAME = 'fourier-borders';
const STORE = 'osm-boundaries';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await open();
    return (await wrap(db.transaction(STORE).objectStore(STORE).get(key))) as T | undefined;
  } catch {
    return undefined;
  }
}

export async function cachePut(key: string, value: unknown): Promise<void> {
  try {
    const db = await open();
    await wrap(db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key));
  } catch {
    // Caching is optional.
  }
}
