/**
 * Minimal promise wrapper over IndexedDB — no external dependency.
 *
 * Two object stores:
 *   • "cache" — the last data successfully fetched from Supabase, keyed per
 *     table (plus user id for private tables). Lets every screen render the
 *     last-known data while offline.
 *   • "queue" — mutations made on the device that have not been acknowledged
 *     by Supabase yet, in creation order (FIFO sync).
 *
 * Everything degrades gracefully: if IndexedDB is unavailable (private mode,
 * old browser) the app keeps working online-only through the same API.
 */

const DB_NAME = "corntrack-offline";
const DB_VERSION = 1;

export const STORE_CACHE = "cache";
export const STORE_QUEUE = "queue";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function runRequest<T>(storeName: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        let tx: IDBTransaction;
        try {
          tx = db.transaction(storeName, mode);
        } catch {
          resolve(null);
          return;
        }
        const request = work(tx.objectStore(storeName));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => resolve(null);
        // If the transaction itself fails, the request handler above never
        // fires; resolve on abort so callers never hang.
        tx.onabort = () => resolve(null);
      })
  );
}

export function idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | null> {
  return runRequest<T>(storeName, "readonly", (store) => store.get(key));
}

export function idbPut(storeName: string, value: unknown): Promise<boolean> {
  return runRequest<IDBValidKey>(storeName, "readwrite", (store) => store.put(value)).then(
    (result) => result !== null
  );
}

export function idbDelete(storeName: string, key: IDBValidKey): Promise<boolean> {
  return runRequest<undefined>(storeName, "readwrite", (store) => store.delete(key)).then(
    (result) => result !== null
  );
}

export function idbAll<T>(storeName: string): Promise<T[]> {
  return runRequest<T[]>(storeName, "readonly", (store) => store.getAll()).then(
    (rows) => rows ?? []
  );
}
