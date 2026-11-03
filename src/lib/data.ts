import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "./supabase";
import {
  flushQueue,
  isOnline,
  loadCachedRows,
  newId,
  purgePendingWhere,
  queueMutation,
  storeCachedRows,
  type QueueOp,
} from "./offline";
import type {
  Budget,
  BudgetItem,
  Buyer,
  CommunityPost,
  Expense,
  FarmerListing,
  Income,
  PriceAlert,
  ProductPrice,
  Profile,
  Subscription,
} from "./types";

/*
 * Data access layer — every screen reads and writes through these hooks.
 *
 * OFFLINE-FIRST (see lib/offline.ts):
 *   Reads  — a successful fetch is cached in IndexedDB; when a fetch fails
 *   (offline), the cached rows are returned instead, so screens keep showing
 *   the last known data instead of zeros.
 *   Writes — every insert/update/delete is queued in IndexedDB FIRST (the
 *   record is safe on the device immediately), then pushed to Supabase right
 *   away when online, or automatically when the connection returns.
 *
 * Query keys:
 *   private rows  → [table, userId]
 *   shared rows   → [table]           (prices, buyers, farmer listings, posts)
 * Mutations invalidate the whole [table] prefix so every list refreshes.
 *
 * Two Supabase/PostgREST realities are handled here, once, for every screen:
 *
 * 1. ORDER SYNTAX — PostgREST expects `order=column.desc,column2.desc`.
 *    Passing a SQL-style string ("expense_date desc, created_at desc") makes
 *    every SELECT fail with HTTP 400, which React Query turns into an empty
 *    list. Always chain one .order() call per column.
 *
 * 2. NUMERIC COLUMNS ARRIVE AS STRINGS — PostgREST serializes PostgreSQL
 *    `numeric` values as JSON strings ("1500.00") to preserve precision.
 *    `Number.isFinite("1500.00")` is false, so peso() printed ₱0 and
 *    reduce() concatenated instead of adding. NUMERIC_COLUMNS + toNumber()
 *    convert every numeric field to a real number at the data boundary so
 *    all screens can keep doing normal math.
 */

export type TableName =
  | "profiles"
  | "expenses"
  | "incomes"
  | "budgets"
  | "budget_items"
  | "product_prices"
  | "price_alerts"
  | "buyers"
  | "farmer_listings"
  | "community_posts"
  | "subscriptions";

/** Columns declared as PostgreSQL `numeric` — PostgREST sends them as strings. */
const NUMERIC_COLUMNS: Record<string, readonly string[]> = {
  profiles: ["farm_size_ha"],
  expenses: ["amount"],
  incomes: ["quantity_kg", "price_per_kg", "deductions", "total_amount"],
  budgets: ["farm_area_ha", "available_budget", "expected_yield_kg", "expected_price_per_kg"],
  budget_items: ["planned_amount"],
  product_prices: ["price"],
  price_alerts: ["target_price"],
  buyers: ["offered_price_per_kg", "quantity_kg", "min_quantity_kg"],
  farmer_listings: ["expected_harvest_kg"],
  community_posts: [],
  subscriptions: ["price_php"],
};

/**
 * Nullable numeric columns (GPS coordinates): PostgREST sends "17.148200" or
 * null. They stay null when empty — 0 is a valid coordinate, so mapping null
 * to 0 would silently place the farm in the Gulf of Guinea.
 */
const NULLABLE_NUMERIC: Record<string, readonly string[]> = {
  profiles: ["farm_latitude", "farm_longitude"],
  buyers: ["latitude", "longitude"],
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Convert one raw PostgREST row into app-shaped data (numerics as numbers). */
function normalizeRow<T extends Record<string, unknown>>(table: string, row: Record<string, unknown>): T {
  const numeric = new Set(NUMERIC_COLUMNS[table] ?? []);
  const nullable = new Set(NULLABLE_NUMERIC[table] ?? []);
  const out: Record<string, unknown> = { ...row };
  for (const key of numeric) {
    if (key in out) out[key] = toNumber(out[key]);
  }
  for (const key of nullable) {
    if (key in out) out[key] = toNullableNumber(out[key]);
  }
  return out as T;
}

function normalizeRows<T extends Record<string, unknown>>(table: string, rows: Record<string, unknown>[]): T[] {
  return rows.map((row) => normalizeRow<T>(table, row));
}

/** Sort specification: ordered columns, each descending unless marked asc. */
type OrderSpec = Array<{ column: string; ascending?: boolean }>;

/** Order helper: one PostgREST .order() call per column (see note 1). */
function withOrder<Query extends { order: (column: string, options?: { ascending?: boolean }) => Query }>(
  query: Query,
  order: OrderSpec
): Query {
  let chained = query;
  for (const spec of order) {
    chained = chained.order(spec.column, { ascending: spec.ascending ?? false });
  }
  return chained;
}

/* ------------------------------ offline cache ------------------------------- */

/** Tables whose rows every signed-in farmer can read (cache key = table). */
const SHARED_TABLES = new Set<string>([
  "product_prices",
  "buyers",
  "farmer_listings",
  "community_posts",
]);

/** Cache key under which a row's table is kept offline. */
export function cacheKeyFor(table: TableName, row: Record<string, unknown>): string {
  if (table === "budget_items") return `budget_items:${String(row.budget_id ?? "")}`;
  if (table === "profiles") return `profiles:${String(row.id ?? "")}`;
  if (SHARED_TABLES.has(table)) return table;
  return `${table}:${String(row.user_id ?? "")}`;
}

/**
 * Runs a Supabase SELECT with an offline fallback: success is normalized,
 * cached in IndexedDB (merged with pending local changes), and failure returns
 * the cached copy. Throws only when there is nothing cached to show.
 *
 * When the device is already offline, the network is skipped entirely — the
 * cached copy answers in milliseconds instead of waiting for a doomed fetch
 * (and React Query's retry backoff) to time out.
 */
async function selectWithCache<T extends Record<string, unknown>>(
  cacheKey: string,
  table: TableName,
  fetchRows: () => Promise<Record<string, unknown>[]>
): Promise<T[]> {
  if (!isOnline()) {
    const cachedOffline = await loadCachedRows<T>(cacheKey, table);
    if (cachedOffline) return cachedOffline;
    throw new Error(
      "You are offline and this screen has no saved copy yet. Open it once while online so CornTrack can keep a copy on your device."
    );
  }
  try {
    const rows = normalizeRows(table, await fetchRows());
    return await storeCachedRows<T>(cacheKey, table, rows);
  } catch (error) {
    const cached = await loadCachedRows<T>(cacheKey, table);
    if (cached) return cached;
    if (!isOnline()) {
      throw new Error(
        "You are offline and this screen has no saved copy yet. Open it once while online so CornTrack can keep a copy on your device."
      );
    }
    throw error;
  }
}

/** Queue a mutation locally, then push immediately when online. */
async function runQueued(
  table: TableName,
  op: QueueOp,
  row: Record<string, unknown> & { id?: string; column?: string; value?: unknown },
  cacheKey: string
): Promise<void> {
  await queueMutation({ table, op, row, cacheKey });
  if (isOnline()) await flushQueue();
}

/* ---------------------------------- Profile ---------------------------------- */

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["profiles", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const rows = await selectWithCache<Profile>(`profiles:${userId ?? ""}`, "profiles", async () => {
        const { data, error } = await requireSupabase()
          .from("profiles")
          .select("*")
          .eq("id", userId as string)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return data ? [data as Record<string, unknown>] : [];
      });
      return rows[0] ?? null;
    },
  });
}

export function useSaveProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (profile: Omit<Profile, "created_at" | "updated_at">) => {
      await runQueued("profiles", "upsert", profile as Record<string, unknown>, `profiles:${profile.id}`);
      return profile as Profile;
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(["profiles", profile.id], profile);
    },
  });
}

/* ------------------------------ Private records ------------------------------ */

export function useExpenses(userId: string | undefined) {
  return useQuery({
    queryKey: ["expenses", userId],
    enabled: Boolean(userId),
    queryFn: () =>
      selectWithCache<Expense>(`expenses:${userId ?? ""}`, "expenses", async () => {
        const { data, error } = await withOrder(
          requireSupabase()
            .from("expenses")
            .select("*")
            .eq("user_id", userId as string),
          [{ column: "expense_date" }, { column: "created_at" }]
        );
        if (error) throw new Error(error.message);
        return (data ?? []) as Record<string, unknown>[];
      }),
  });
}

export function useIncomes(userId: string | undefined) {
  return useQuery({
    queryKey: ["incomes", userId],
    enabled: Boolean(userId),
    queryFn: () =>
      selectWithCache<Income>(`incomes:${userId ?? ""}`, "incomes", async () => {
        const { data, error } = await withOrder(
          requireSupabase()
            .from("incomes")
            .select("*")
            .eq("user_id", userId as string),
          [{ column: "selling_date" }, { column: "created_at" }]
        );
        if (error) throw new Error(error.message);
        return (data ?? []) as Record<string, unknown>[];
      }),
  });
}

export function useBudgets(userId: string | undefined) {
  return useQuery({
    queryKey: ["budgets", userId],
    enabled: Boolean(userId),
    queryFn: () =>
      selectWithCache<Budget>(`budgets:${userId ?? ""}`, "budgets", async () => {
        const { data, error } = await withOrder(
          requireSupabase()
            .from("budgets")
            .select("*")
            .eq("user_id", userId as string),
          [{ column: "created_at" }]
        );
        if (error) throw new Error(error.message);
        return (data ?? []) as Record<string, unknown>[];
      }),
  });
}

export function useBudgetItems(budgetId: string | undefined) {
  return useQuery({
    queryKey: ["budget_items", budgetId],
    enabled: Boolean(budgetId),
    queryFn: () =>
      selectWithCache<BudgetItem>(`budget_items:${budgetId ?? ""}`, "budget_items", async () => {
        const { data, error } = await requireSupabase()
          .from("budget_items")
          .select("*")
          .eq("budget_id", budgetId as string)
          .order("category", { ascending: true });
        if (error) throw new Error(error.message);
        return (data ?? []) as Record<string, unknown>[];
      }),
  });
}

export function usePriceAlerts(userId: string | undefined) {
  return useQuery({
    queryKey: ["price_alerts", userId],
    enabled: Boolean(userId),
    queryFn: () =>
      selectWithCache<PriceAlert>(`price_alerts:${userId ?? ""}`, "price_alerts", async () => {
        const { data, error } = await withOrder(
          requireSupabase()
            .from("price_alerts")
            .select("*")
            .eq("user_id", userId as string),
          [{ column: "created_at" }]
        );
        if (error) throw new Error(error.message);
        return (data ?? []) as Record<string, unknown>[];
      }),
  });
}

/* ------------------------------ Subscriptions ------------------------------ */

/** The farmer's latest subscription row (null when never subscribed). */
export function useSubscription(userId: string | undefined) {
  return useQuery({
    queryKey: ["subscriptions", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const rows = await selectWithCache<Subscription>(
        `subscriptions:${userId ?? ""}`,
        "subscriptions",
        async () => {
          const { data, error } = await withOrder(
            requireSupabase()
              .from("subscriptions")
              .select("*")
              .eq("user_id", userId as string),
            [{ column: "created_at" }]
          );
          if (error) throw new Error(error.message);
          return (data ?? []) as Record<string, unknown>[];
        }
      );
      return rows[0] ?? null;
    },
  });
}

/* -------------------------------- Shared data -------------------------------- */

export function usePrices() {
  return useQuery({
    queryKey: ["product_prices"],
    queryFn: () =>
      selectWithCache<ProductPrice>("product_prices", "product_prices", async () => {
        const { data, error } = await withOrder(
          requireSupabase().from("product_prices").select("*"),
          [{ column: "reported_at" }, { column: "created_at" }]
        );
        if (error) throw new Error(error.message);
        return (data ?? []) as Record<string, unknown>[];
      }),
  });
}

export function useBuyers() {
  return useQuery({
    queryKey: ["buyers"],
    queryFn: () =>
      selectWithCache<Buyer>("buyers", "buyers", async () => {
        const { data, error } = await withOrder(requireSupabase().from("buyers").select("*"), [
          { column: "created_at" },
        ]);
        if (error) throw new Error(error.message);
        return (data ?? []) as Record<string, unknown>[];
      }),
  });
}

export function useFarmerListings() {
  return useQuery({
    queryKey: ["farmer_listings"],
    queryFn: () =>
      selectWithCache<FarmerListing>("farmer_listings", "farmer_listings", async () => {
        const { data, error } = await withOrder(
          requireSupabase().from("farmer_listings").select("*"),
          [{ column: "created_at" }]
        );
        if (error) throw new Error(error.message);
        return (data ?? []) as Record<string, unknown>[];
      }),
  });
}

export function usePosts() {
  return useQuery({
    queryKey: ["community_posts"],
    queryFn: () =>
      selectWithCache<CommunityPost>("community_posts", "community_posts", async () => {
        const { data, error } = await withOrder(
          requireSupabase().from("community_posts").select("*"),
          [{ column: "created_at" }]
        );
        if (error) throw new Error(error.message);
        return (data ?? []) as Record<string, unknown>[];
      }),
  });
}

/* --------------------------------- Mutations --------------------------------- */

/**
 * While offline, invalidation alone cannot refresh a query (the refetch
 * fails), so the just-saved row would be invisible until reconnect. This
 * merges the pending row straight into the React Query cache: the local row
 * (with its client-generated id) appears immediately; the next successful
 * server fetch replaces it with the canonical row.
 */
function seedLocalRow(
  queryClient: ReturnType<typeof useQueryClient>,
  table: TableName,
  row: Record<string, unknown> & { id: string; user_id?: string }
): void {
  for (const query of queryClient.getQueryCache().getAll()) {
    const [queryTable, scope] = query.queryKey as [string, unknown];
    if (queryTable !== table) continue;
    const isPrivateList = scope !== undefined;
    if (isPrivateList && String(row.user_id ?? "") !== String(scope ?? "")) continue;

    const current = (query.state.data as Record<string, unknown>[] | undefined) ?? [];
    if (current.some((entry) => String(entry.id) === String(row.id))) continue;
    queryClient.setQueryData(query.queryKey, [...current, row]);
  }
}

/**
 * All inserts are offline-first: the row is written to the device queue with a
 * client-generated UUID and pushed to Supabase immediately when online. The
 * mutation resolves with the local row (the id the server will store).
 */
export function useInsertRow<T extends Record<string, unknown>>(table: TableName) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (row: T) => {
      const cacheKey = cacheKeyFor(table, row);
      const id = await queueMutation({ table, op: "insert", row, cacheKey });
      if (isOnline()) await flushQueue();
      return { ...row, id, created_at: new Date().toISOString() } as T & { id: string };
    },
    onSuccess: (row) => {
      if (!isOnline()) seedLocalRow(queryClient, table, row);
      queryClient.invalidateQueries({ queryKey: [table] });
    },
  });
}

export function useUpdateRow<T extends { id: string }>(table: TableName) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (row: T) => {
      await runQueued(table, "update", row as Record<string, unknown>, cacheKeyFor(table, row));
      return row;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [table] }),
  });
}

/**
 * Deletes offline-first: a row still waiting to sync is simply removed from
 * the queue; a synced row is queued for server deletion. Pass the cache key
 * (table-scoped) so the offline copy updates too.
 */
export function useDeleteRow(table: TableName, cacheKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // A budget deleted before it synced must take its unsynced items too,
      // or their inserts would hit a foreign-key error on flush.
      if (table === "budgets") {
        await purgePendingWhere("budget_items", "budget_id", id);
      }
      await queueMutation({ table, op: "delete", row: { id }, cacheKey });
      if (isOnline()) await flushQueue();
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [table] });
      if (table === "budgets") {
        // budget_items are removed by ON DELETE CASCADE — refresh them too.
        queryClient.invalidateQueries({ queryKey: ["budget_items"] });
      }
    },
  });
}

/** Update a budget and replace its planned category amounts in one call. */
export function useUpdateBudgetWithItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      budgetId: string;
      budget: Partial<Omit<Budget, "id" | "created_at" | "user_id">> & { user_id?: string };
      items: Array<{ category: string; planned_amount: number; notes?: string }>;
    }) => {
      const userId = input.budget.user_id ?? "";
      await runQueued(
        "budgets",
        "update",
        { ...input.budget, id: input.budgetId },
        `budgets:${userId}`
      );
      await runQueued(
        "budget_items",
        "deleteWhere",
        { column: "budget_id", value: input.budgetId },
        `budget_items:${input.budgetId}`
      );
      for (const item of input.items.filter((entry) => entry.planned_amount > 0)) {
        await runQueued(
          "budget_items",
          "insert",
          { ...item, id: newId(), budget_id: input.budgetId },
          `budget_items:${input.budgetId}`
        );
      }
      if (isOnline()) await flushQueue();
      return { id: input.budgetId, ...input.budget } as Budget;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      queryClient.invalidateQueries({ queryKey: ["budget_items"] });
    },
  });
}

/** Insert a full budget with its planned category amounts in one call. */
export function useSaveBudgetWithItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      budget: Omit<Budget, "id" | "created_at">;
      items: Array<{ category: string; planned_amount: number; notes?: string }>;
    }) => {
      const budgetId = newId();
      await runQueued(
        "budgets",
        "insert",
        { ...input.budget, id: budgetId },
        `budgets:${input.budget.user_id}`
      );
      for (const item of input.items.filter((entry) => entry.planned_amount > 0)) {
        await runQueued(
          "budget_items",
          "insert",
          { ...item, id: newId(), budget_id: budgetId },
          `budget_items:${budgetId}`
        );
      }
      if (isOnline()) await flushQueue();
      return {
        ...input.budget,
        id: budgetId,
        created_at: new Date().toISOString(),
      } as Budget;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      queryClient.invalidateQueries({ queryKey: ["budget_items"] });
    },
  });
}
