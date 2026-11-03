import { useEffect, useState } from "react";
import { requireSupabase } from "./supabase";
import { idbAll, idbDelete, idbGet, idbPut, STORE_CACHE, STORE_QUEUE } from "./idb";

/**
 * CornTrack offline-first sync engine.
 *
 * Contract with the rest of the app:
 *   1. EVERY mutation (insert / update / delete) is written to the IndexedDB
 *      queue FIRST — the record is durable on the device the moment the user
 *      taps Save, even with no connection.
 *   2. While online, the queue is flushed to Supabase immediately (FIFO).
 *      While offline, it drains automatically when the connection returns
 *      (`online` event, app focus, or a 20s timer).
 *   3. Rows created offline get a client-generated UUID, so edits/deletes of a
 *      still-unsynced row simply rewrite the queued entry — the server later
 *      stores the row under the same id and everything lines up.
 *   4. Reads fall back to the IndexedDB cache of the last successful fetch
 *      (with pending queue entries overlaid), so screens show real data, not
 *      zeros, while offline.
 *
 * Failure policy: network errors stop the flush and are retried later. Hard
 * errors (rejected by PostgREST/RLS, schema mismatch…) mark the entry failed —
 * it is shown in the sync banner where the farmer can retry or discard it, and
 * it never blocks the rest of the queue.
 */

export const SYNCED_EVENT = "corntrack:synced";

export type QueueOp = "insert" | "update" | "delete" | "upsert" | "deleteWhere";

export type QueueEntry = {
  /** Queue id; for insert/upsert it is also the row's client-generated id. */
  id: string;
  table: string;
  op: QueueOp;
  /** Full row (insert/upsert), changed columns (update), { column, value } (deleteWhere). Empty for delete. */
  payload: Record<string, unknown>;
  /** Row targeted by update/delete. */
  rowId?: string;
  createdAt: number;
  tries: number;
  failed: boolean;
  lastError?: string;
};

type CachedRows = { key: string; table: string; rows: Record<string, unknown>[]; cachedAt: number };

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeSync(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/* ---------------------------------- ids ---------------------------------- */

/** UUID for rows created on the device (used as primary key on the server). */
export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Fallback for browsers without crypto.randomUUID (non-secure contexts).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/* -------------------------------- online --------------------------------- */

export function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/** True when the error looks like a connection problem rather than a rejection. */
function isNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch|fetch failed|networkerror|network request|load failed|timeout|offline/i.test(
    message
  );
}

/* --------------------------------- cache ---------------------------------- */

/**
 * Reads the cached rows for a key with the current pending queue overlaid.
 * Returns null when nothing was ever cached for this key.
 */
export async function loadCachedRows<T extends Record<string, unknown>>(
  cacheKey: string,
  table: string
): Promise<T[] | null> {
  const entry = await idbGet<CachedRows>(STORE_CACHE, cacheKey);
  if (!entry) return null;
  const merged = await overlayQueue(table, entry.rows);
  return merged as T[];
}

/**
 * Stores freshly fetched server rows and returns them with pending local
 * changes overlaid, so the UI never momentarily hides unsynced work.
 */
export async function storeCachedRows<T extends Record<string, unknown>>(
  cacheKey: string,
  table: string,
  rows: Record<string, unknown>[]
): Promise<T[]> {
  const merged = await overlayQueue(table, rows);
  await idbPut(STORE_CACHE, {
    key: cacheKey,
    table,
    rows: merged,
    cachedAt: Date.now(),
  } satisfies CachedRows);
  return merged as T[];
}

/** Re-applies the queue on top of whatever is already cached (after enqueue). */
async function refreshCache(cacheKey: string, table: string): Promise<void> {
  const entry = await idbGet<CachedRows>(STORE_CACHE, cacheKey);
  if (!entry) {
    // Nothing cached yet — seed an empty cache so pending rows are visible.
    await storeCachedRows(cacheKey, table, []);
    return;
  }
  await storeCachedRows(cacheKey, table, entry.rows);
}

/**
 * Applies queued mutations to a set of rows: pending inserts appear, pending
 * updates are merged, pending deletes are removed. Rows already on the server
 * win over a queued insert with the same id (the insert was just pushed).
 */
async function overlayQueue(
  table: string,
  rows: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  const queue = (await idbAll<QueueEntry>(STORE_QUEUE)).sort((a, b) => a.createdAt - b.createdAt);
  const relevant = queue.filter((entry) => entry.table === table && !entry.failed);
  if (!relevant.length) return rows;

  const merged = rows.map((row) => ({ ...row }));
  const indexById = new Map<string, number>(merged.map((row, index) => [String(row.id), index]));

  const upsert = (row: Record<string, unknown>) => {
    const id = String(row.id);
    const index = indexById.get(id);
    if (index === undefined) {
      indexById.set(id, merged.length);
      merged.push(row);
    } else {
      merged[index] = { ...merged[index], ...row };
    }
  };

  for (const entry of relevant) {
    if (entry.op === "insert" || entry.op === "upsert") {
      upsert(entry.payload);
    } else if (entry.op === "update" && entry.rowId) {
      const index = indexById.get(entry.rowId);
      if (index !== undefined) merged[index] = { ...merged[index], ...entry.payload };
    } else if (entry.op === "delete" && entry.rowId) {
      const index = indexById.get(entry.rowId);
      if (index !== undefined) {
        merged.splice(index, 1);
        indexById.delete(entry.rowId);
      }
    } else if (entry.op === "deleteWhere" && entry.payload.column) {
      const column = String(entry.payload.column);
      for (let index = merged.length - 1; index >= 0; index -= 1) {
        if (String(merged[index][column] ?? "") === String(entry.payload.value ?? "")) {
          indexById.delete(String(merged[index].id ?? ""));
          merged.splice(index, 1);
        }
      }
    }
  }
  return merged;
}

/* ---------------------------------- queue --------------------------------- */

export async function getQueue(): Promise<QueueEntry[]> {
  return (await idbAll<QueueEntry>(STORE_QUEUE)).sort((a, b) => a.createdAt - b.createdAt);
}

/** Entries that failed to sync and need the farmer's attention. */
export async function getFailedEntries(): Promise<QueueEntry[]> {
  return (await getQueue()).filter((entry) => entry.failed);
}

/** Ids of rows created on this device that Supabase has not confirmed yet. */
export async function pendingRowIds(table: string): Promise<Set<string>> {
  const queue = await getQueue();
  const ids = new Set<string>();
  for (const entry of queue) {
    if (entry.table === table && !entry.failed && (entry.op === "insert" || entry.op === "upsert")) {
      ids.add(entry.id);
    }
  }
  return ids;
}

/**
 * Adds a mutation to the queue (local-first) and refreshes the cache.
 *
 * Insert/update/delete of a row that is still queued is rewritten in place:
 * editing a not-yet-synced row just updates its queued payload, deleting it
 * drops it from the queue entirely — no pointless server round-trips.
 */
export async function enqueueMutation(
  entry: Omit<QueueEntry, "createdAt" | "tries" | "failed">,
  cacheKey: string
): Promise<void> {
  const existing = await idbGet<QueueEntry>(STORE_QUEUE, entry.id);
  if (existing && existing.failed) {
    // Retrying a failed entry: reset its error state and replace its payload.
    const next: QueueEntry = { ...existing, ...entry, tries: existing.tries + 1, failed: false, lastError: undefined };
    await idbPut(STORE_QUEUE, next);
  } else {
    await idbPut(STORE_QUEUE, {
      ...entry,
      createdAt: existing?.createdAt ?? Date.now(),
      tries: existing ? existing.tries + 1 : 0,
      failed: false,
    } satisfies QueueEntry);
  }
  await refreshCache(cacheKey, entry.table);
  notify();
}

/**
 * Routes a user mutation into the queue with the pending-row shortcuts above.
 * `payload` is the full row for insert/upsert, or the changed columns for update.
 */
export async function queueMutation(options: {
  table: string;
  op: QueueOp;
  row: Record<string, unknown> & { id?: string };
  cacheKey: string;
}): Promise<string> {
  const { table, op, row, cacheKey } = options;

  if (op === "insert" || op === "upsert") {
    const id = row.id ? String(row.id) : newId();
    await enqueueMutation({ id, table, op, payload: { ...row, id } }, cacheKey);
    return id;
  }

  const rowId = String(row.id);
  const queued = await idbGet<QueueEntry>(STORE_QUEUE, rowId);

  if (queued && (queued.op === "insert" || queued.op === "upsert")) {
    if (op === "delete") {
      // Row never reached the server — cancel it locally.
      await idbDelete(STORE_QUEUE, rowId);
    } else {
      // Edit of an unsynced row — merge into the queued insert.
      await enqueueMutation(
        { id: rowId, table, op: "insert", payload: { ...queued.payload, ...row, id: rowId } },
        cacheKey
      );
    }
    await refreshCache(cacheKey, table);
    notify();
    return rowId;
  }

  if (op === "deleteWhere") {
    // e.g. "remove every budget_item of budget X" (payload = { column, value })
    await enqueueMutation(
      { id: `deleteWhere:${table}:${String(row.column)}:${String(row.value)}:${Date.now()}`, table, op, payload: { ...row } },
      cacheKey
    );
    return "";
  }

  const { id: _drop, ...changes } = row;
  await enqueueMutation(
    { id: `${op}:${rowId}:${Date.now()}`, table, op, payload: changes, rowId },
    cacheKey
  );
  return rowId;
}

/**
 * Drops every queued insert for `table` whose payload[column] === value — used
 * when a parent row (e.g. a budget created offline) is deleted before it ever
 * synced, so its child items are not pushed into a foreign-key error.
 */
export async function purgePendingWhere(
  table: string,
  column: string,
  value: string
): Promise<void> {
  const queue = await getQueue();
  for (const entry of queue) {
    if (
      entry.table === table &&
      !entry.failed &&
      (entry.op === "insert" || entry.op === "upsert") &&
      String(entry.payload[column] ?? "") === value
    ) {
      await idbDelete(STORE_QUEUE, entry.id);
    }
  }
  notify();
}

/** Discards a failed entry (the farmer chose to drop that change). */
export async function discardFailedEntry(entryId: string, cacheKey: string, table: string): Promise<void> {
  const entry = await idbGet<QueueEntry>(STORE_QUEUE, entryId);
  if (!entry) return;
  await idbDelete(STORE_QUEUE, entryId);
  if (entry.op === "insert" || entry.op === "upsert") {
    await refreshCache(cacheKey, table);
  }
  notify();
}

/** Clears the failed flag on every entry (manual "retry sync") and flushes. */
export async function retryFailed(): Promise<number> {
  const queue = await getQueue();
  for (const entry of queue) {
    if (entry.failed) {
      await idbPut(STORE_QUEUE, { ...entry, failed: false, lastError: undefined } satisfies QueueEntry);
    }
  }
  notify();
  return flushQueue();
}

/* --------------------------------- flush ---------------------------------- */

let flushing = false;

async function pushEntry(entry: QueueEntry): Promise<void> {
  const client = requireSupabase();
  if (entry.op === "insert") {
    // upsert + ignoreDuplicates makes retries safe: if a previous attempt
    // actually reached the server but the response was lost, the retry is a
    // no-op instead of a primary-key conflict.
    const { error } = await client
      .from(entry.table)
      .upsert(entry.payload, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  } else if (entry.op === "upsert") {
    const { error } = await client.from(entry.table).upsert(entry.payload);
    if (error) throw new Error(error.message);
  } else if (entry.op === "update" && entry.rowId) {
    const { error } = await client.from(entry.table).update(entry.payload).eq("id", entry.rowId);
    if (error) throw new Error(error.message);
  } else if (entry.op === "delete" && entry.rowId) {
    const { error } = await client.from(entry.table).delete().eq("id", entry.rowId);
    if (error) throw new Error(error.message);
  } else if (entry.op === "deleteWhere" && entry.payload.column) {
    const { error } = await client
      .from(entry.table)
      .delete()
      .eq(String(entry.payload.column), entry.payload.value);
    if (error) throw new Error(error.message);
  }
}

/**
 * Drains the queue in order. Returns how many entries were pushed. Network
 * errors stop the drain (retried later); hard errors mark the entry failed.
 */
export async function flushQueue(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  notify();
  let pushed = 0;
  try {
    for (;;) {
      const queue = await getQueue();
      const entry = queue.find((row) => !row.failed);
      if (!entry) break;
      try {
        await pushEntry(entry);
        await idbDelete(STORE_QUEUE, entry.id);
        pushed += 1;
        notify();
      } catch (error) {
        if (isNetworkError(error)) break; // offline again — keep the queue
        const message = error instanceof Error ? error.message : String(error);
        await idbPut(STORE_QUEUE, {
          ...entry,
          failed: true,
          lastError: message,
          tries: entry.tries + 1,
        } satisfies QueueEntry);
        notify();
        // Continue with the next entry — one bad row must not block the queue.
      }
    }
  } finally {
    flushing = false;
    notify();
  }
  if (pushed > 0 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SYNCED_EVENT));
  }
  return pushed;
}

/* ------------------------------- auto-sync -------------------------------- */

let started = false;

/** Starts the automatic drain: on reconnect, on focus, and every 20 seconds. */
export function startAutoSync(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("online", () => void flushQueue());
  window.addEventListener("focus", () => {
    if (isOnline()) void flushQueue();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isOnline()) void flushQueue();
  });
  window.setInterval(() => {
    if (isOnline()) void flushQueue();
  }, 20_000);
  if (isOnline()) void flushQueue();
}

/* --------------------------------- hooks ---------------------------------- */

export type SyncSnapshot = {
  syncing: boolean;
  entries: QueueEntry[];
  pendingCount: number;
  failedCount: number;
};

let snapshotCache: SyncSnapshot = { syncing: false, entries: [], pendingCount: 0, failedCount: 0 };

function snapshot(): SyncSnapshot {
  return snapshotCache;
}

async function refreshSnapshot() {
  const entries = await getQueue();
  snapshotCache = {
    syncing: flushing,
    entries,
    pendingCount: entries.filter((entry) => !entry.failed).length,
    failedCount: entries.filter((entry) => entry.failed).length,
  };
}

/** Live sync state for the banner. */
export function useSyncStatus(): SyncSnapshot {
  const [state, setState] = useState<SyncSnapshot>(snapshot);
  useEffect(() => {
    let alive = true;
    const update = async () => {
      await refreshSnapshot();
      if (alive) setState(snapshot());
    };
    void update();
    return subscribeSync(() => void update());
  }, []);
  return state;
}

/** Live online/offline flag. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(isOnline());
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** Ids of rows in `table` that exist locally but have not synced yet. */
export function usePendingIds(table: string): Set<string> {
  const sync = useSyncStatus();
  const ids = new Set<string>();
  for (const entry of sync.entries) {
    if (entry.table === table && !entry.failed && (entry.op === "insert" || entry.op === "upsert")) {
      ids.add(entry.id);
    }
  }
  return ids;
}
