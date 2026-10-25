/**
 * NextProblem - IndexedDB Local Storage & Caching Layer
 * 
 * Viva Explanation Notes:
 * 1. Why IndexedDB instead of localStorage?
 *    localStorage has a strict 5 MB quota and blocks the main UI thread synchronously.
 *    IndexedDB is asynchronous, transactional, and supports large JSON objects (up to hundreds of MBs),
 *    making it ideal for caching hundreds of Codeforces submissions and problems.
 * 2. Cache Hit Telemetry:
 *    Tracks cache hits vs API network misses directly in the DB to measure real offline caching performance.
 */

const DB_NAME = 'NextProblemDB';
const DB_VERSION = 1;
const STORE_CACHE = 'api_cache';
const STORE_TELEMETRY = 'telemetry_store';

export interface CacheEntry<T> {
  key: string;
  data: T;
  timestamp: number;
}

export class OfflineStorage {
  private static dbPromise: Promise<IDBDatabase> | null = null;

  private static getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_CACHE)) {
          db.createObjectStore(STORE_CACHE, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_TELEMETRY)) {
          db.createObjectStore(STORE_TELEMETRY, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  static async get<T>(key: string): Promise<T | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const transaction = db.transaction(STORE_CACHE, 'readonly');
        const store = transaction.objectStore(STORE_CACHE);
        const req = store.get(key);

        req.onsuccess = () => {
          const entry = req.result as CacheEntry<T> | undefined;
          resolve(entry ? entry.data : null);
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  static async set<T>(key: string, data: T): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const transaction = db.transaction(STORE_CACHE, 'readwrite');
        const store = transaction.objectStore(STORE_CACHE);
        const entry: CacheEntry<T> = { key, data, timestamp: Date.now() };
        store.put(entry);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
      });
    } catch {
      // Graceful ignore
    }
  }

  static async recordCacheHit(hit: boolean): Promise<{ hits: number; misses: number; hitRatio: number }> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const transaction = db.transaction(STORE_TELEMETRY, 'readwrite');
        const store = transaction.objectStore(STORE_TELEMETRY);
        const req = store.get('cache_counters');

        req.onsuccess = () => {
          const current = req.result || { key: 'cache_counters', hits: 0, misses: 0 };
          if (hit) {
            current.hits = (current.hits || 0) + 1;
          } else {
            current.misses = (current.misses || 0) + 1;
          }
          store.put(current);

          const total = current.hits + current.misses;
          const hitRatio = total > 0 ? Math.round((current.hits / total) * 100) : 0;
          resolve({ hits: current.hits, misses: current.misses, hitRatio });
        };

        req.onerror = () => resolve({ hits: hit ? 1 : 0, misses: hit ? 0 : 1, hitRatio: hit ? 100 : 0 });
      });
    } catch {
      return { hits: hit ? 1 : 0, misses: hit ? 0 : 1, hitRatio: hit ? 100 : 0 };
    }
  }

  static async getCacheStats(): Promise<{ hits: number; misses: number; hitRatio: number }> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const transaction = db.transaction(STORE_TELEMETRY, 'readonly');
        const store = transaction.objectStore(STORE_TELEMETRY);
        const req = store.get('cache_counters');

        req.onsuccess = () => {
          const current = req.result || { hits: 0, misses: 0 };
          const total = current.hits + current.misses;
          const hitRatio = total > 0 ? Math.round((current.hits / total) * 100) : 0;
          resolve({ hits: current.hits, misses: current.misses, hitRatio });
        };
        req.onerror = () => resolve({ hits: 0, misses: 0, hitRatio: 0 });
      });
    } catch {
      return { hits: 0, misses: 0, hitRatio: 0 };
    }
  }
}
