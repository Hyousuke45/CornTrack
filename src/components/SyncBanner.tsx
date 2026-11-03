import { useState } from "react";
import { CloudOff, CloudUpload, RefreshCw, Trash2 } from "lucide-react";
import { cacheKeyFor, type TableName } from "@/lib/data";
import {
  discardFailedEntry,
  retryFailed,
  useOnlineStatus,
  useSyncStatus,
  type QueueEntry,
} from "@/lib/offline";
import { Sheet } from "@/components/ui";
import { useToast } from "@/components/Toast";

/** Human label for a queued change, used in the sync review sheet. */
function describeEntry(entry: QueueEntry): string {
  const table = entry.table.replace(/_/g, " ");
  if (entry.op === "insert" || entry.op === "upsert") return `New ${table.replace(/s$/, "")} entry`;
  if (entry.op === "update") return `Edited ${table.replace(/s$/, "")} entry`;
  if (entry.op === "deleteWhere") return `Replaced ${table}`;
  return `Deleted ${table.replace(/s$/, "")} entry`;
}

/**
 * Always-visible connection strip: tells the farmer what is offline, what is
 * waiting to sync, and when something could not be pushed (with a retry /
 * discard choice) — no silent data loss, no mysterious zeros.
 */
export function SyncBanner() {
  const online = useOnlineStatus();
  const { syncing, pendingCount, failedCount, entries } = useSyncStatus();
  const [review, setReview] = useState(false);
  const { toast } = useToast();

  if (online && !syncing && pendingCount === 0 && failedCount === 0) return null;

  const tone = failedCount > 0 ? "warn" : online ? "busy" : "offline";

  return (
    <>
      <div
        className={`sync-banner sync-${tone}`}
        role="status"
        data-testid="sync-banner"
        onClick={() => (failedCount > 0 || (online && pendingCount > 0)) && setReview(true)}
      >
        {failedCount > 0 ? (
          <CloudUpload size={14} />
        ) : online ? (
          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
        ) : (
          <CloudOff size={14} />
        )}
        <span>
          {failedCount > 0
            ? `${failedCount} change${failedCount > 1 ? "s" : ""} could not sync — tap to review`
            : online
              ? pendingCount > 0
                ? `Syncing ${pendingCount} change${pendingCount > 1 ? "s" : ""}…`
                : "Syncing…"
              : pendingCount > 0
                ? `Offline — ${pendingCount} change${pendingCount > 1 ? "s" : ""} saved on this device`
                : "Offline — showing data saved on this device"}
        </span>
      </div>

      {review && (
        <Sheet title="Sync status" close={() => setReview(false)}>
          {online ? (
            <p className="text-[11.5px] leading-relaxed text-[#5c6b5e]">
              Connected. Pending changes are pushed automatically; anything the database rejected
              stays listed below until you retry or discard it.
            </p>
          ) : (
            <p className="text-[11.5px] leading-relaxed text-[#5c6b5e]">
              You are offline. Your changes are saved on this device and will be sent to Supabase
              automatically as soon as the connection returns.
            </p>
          )}

          <div className="mt-3">
            {entries.map((entry) => {
              const cacheKey = cacheKeyFor(entry.table as TableName, entry.payload);
              return (
                <div key={entry.id} className="data-row items-start text-xs">
                  <span className="min-w-0 flex-1">
                    <b className="block">{describeEntry(entry)}</b>
                    {entry.failed && entry.lastError && (
                      <span className="mt-0.5 block break-words font-mono text-[10px] text-[#d93025]">
                        {entry.lastError}
                      </span>
                    )}
                    <span className="mt-0.5 block text-[10px] text-[#98a394]">
                      {entry.failed ? "Not sent" : "Waiting for connection"}
                    </span>
                  </span>
                  {entry.failed && (
                    <span className="flex flex-none gap-1">
                      <button
                        className="row-edit"
                        onClick={async () => {
                          await discardFailedEntry(entry.id, cacheKey, entry.table);
                          toast({ title: "Change discarded", description: "It will not be sent to Supabase." });
                        }}
                      >
                        <Trash2 size={12} /> Discard
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {entries.some((entry) => entry.failed) && (
            <button
              className="btn-primary mt-4 w-full"
              onClick={async () => {
                await retryFailed();
                toast({ title: "Retrying sync…", description: "We will try to push every change again." });
              }}
            >
              <RefreshCw size={14} /> Retry sync now
            </button>
          )}
        </Sheet>
      )}
    </>
  );
}
