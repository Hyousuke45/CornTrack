import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "./supabase";
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
} from "./types";

/*
 * Data access layer — every screen reads and writes through these hooks,
 * which call Supabase (PostgREST) directly. There is no mock data anywhere:
 * if the database is empty, screens show their empty states.
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
  | "expenses"
  | "incomes"
  | "budgets"
  | "budget_items"
  | "product_prices"
  | "price_alerts"
  | "buyers"
  | "farmer_listings"
  | "community_posts";

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
};

/** Convert one raw PostgREST row into app-shaped data (numerics as numbers). */
function normalizeRow<T extends Record<string, unknown>>(table: string, row: Record<string, unknown>): T {
  const numeric = new Set(NUMERIC_COLUMNS[table] ?? []);
  const out: Record<string, unknown> = { ...row };
  for (const key of numeric) {
    if (key in out) out[key] = toNumber(out[key]);
  }
  return out as T;
}

function normalizeRows<T extends Record<string, unknown>>(table: string, rows: Record<string, unknown>[]): T[] {
  return rows.map((row) => normalizeRow<T>(table, row));
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

async function selectPrivate<T extends Record<string, unknown>>(
  table: TableName,
  userId: string,
  order: OrderSpec
): Promise<T[]> {
  const query = withOrder(
    requireSupabase()
      .from(table)
      .select("*")
      .eq("user_id", userId),
    order
  );
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return normalizeRows<T>(table, (data ?? []) as Record<string, unknown>[]);
}

async function selectShared<T extends Record<string, unknown>>(table: TableName, order: OrderSpec): Promise<T[]> {
  const query = withOrder(requireSupabase().from(table).select("*"), order);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return normalizeRows<T>(table, (data ?? []) as Record<string, unknown>[]);
}

/* ---------------------------------- Profile ---------------------------------- */

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["profiles", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? normalizeRow<Profile>("profiles", data as Record<string, unknown>) : null;
    },
  });
}

export function useSaveProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (profile: Omit<Profile, "created_at" | "updated_at">) => {
      const { data, error } = await requireSupabase()
        .from("profiles")
        .upsert(profile)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return normalizeRow<Profile>("profiles", data as Record<string, unknown>);
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
      selectPrivate<Expense>("expenses", userId as string, [
        { column: "expense_date" },
        { column: "created_at" },
      ]),
  });
}

export function useIncomes(userId: string | undefined) {
  return useQuery({
    queryKey: ["incomes", userId],
    enabled: Boolean(userId),
    queryFn: () =>
      selectPrivate<Income>("incomes", userId as string, [
        { column: "selling_date" },
        { column: "created_at" },
      ]),
  });
}

export function useBudgets(userId: string | undefined) {
  return useQuery({
    queryKey: ["budgets", userId],
    enabled: Boolean(userId),
    queryFn: () => selectPrivate<Budget>("budgets", userId as string, [{ column: "created_at" }]),
  });
}

export function useBudgetItems(budgetId: string | undefined) {
  return useQuery({
    queryKey: ["budget_items", budgetId],
    enabled: Boolean(budgetId),
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from("budget_items")
        .select("*")
        .eq("budget_id", budgetId as string)
        .order("category", { ascending: true });
      if (error) throw new Error(error.message);
      return normalizeRows<BudgetItem>("budget_items", (data ?? []) as Record<string, unknown>[]);
    },
  });
}

export function usePriceAlerts(userId: string | undefined) {
  return useQuery({
    queryKey: ["price_alerts", userId],
    enabled: Boolean(userId),
    queryFn: () => selectPrivate<PriceAlert>("price_alerts", userId as string, [{ column: "created_at" }]),
  });
}

/* -------------------------------- Shared data -------------------------------- */

export function usePrices() {
  return useQuery({
    queryKey: ["product_prices"],
    queryFn: () =>
      selectShared<ProductPrice>("product_prices", [
        { column: "reported_at" },
        { column: "created_at" },
      ]),
  });
}

export function useBuyers() {
  return useQuery({
    queryKey: ["buyers"],
    queryFn: () => selectShared<Buyer>("buyers", [{ column: "created_at" }]),
  });
}

export function useFarmerListings() {
  return useQuery({
    queryKey: ["farmer_listings"],
    queryFn: () => selectShared<FarmerListing>("farmer_listings", [{ column: "created_at" }]),
  });
}

export function usePosts() {
  return useQuery({
    queryKey: ["community_posts"],
    queryFn: () => selectShared<CommunityPost>("community_posts", [{ column: "created_at" }]),
  });
}

/* --------------------------------- Mutations --------------------------------- */

export function useInsertRow<T extends Record<string, unknown>>(table: TableName) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (row: T) => {
      const { data, error } = await requireSupabase()
        .from(table)
        .insert(row)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return normalizeRow<T & { id: string }>(table, data as Record<string, unknown>);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [table] }),
  });
}

export function useUpdateRow<T extends { id: string }>(table: TableName) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (row: T) => {
      const { id, ...changes } = row;
      const { data, error } = await requireSupabase()
        .from(table)
        .update(changes as Record<string, unknown>)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return normalizeRow<T>(table, data as Record<string, unknown>);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [table] }),
  });
}

export function useDeleteRow(table: TableName) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await requireSupabase().from(table).delete().eq("id", id);
      if (error) throw new Error(error.message);
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
      budget: Partial<Omit<Budget, "id" | "created_at" | "user_id">>;
      items: Array<{ category: string; planned_amount: number; notes?: string }>;
    }) => {
      const client = requireSupabase();
      const { data: budgetRow, error: budgetError } = await client
        .from("budgets")
        .update(input.budget)
        .eq("id", input.budgetId)
        .select()
        .single();
      if (budgetError) throw new Error(budgetError.message);
      const budget = budgetRow as Budget;
      const { error: clearError } = await client
        .from("budget_items")
        .delete()
        .eq("budget_id", input.budgetId);
      if (clearError) throw new Error(clearError.message);
      const rows = input.items
        .filter((item) => item.planned_amount > 0)
        .map((item) => ({ ...item, budget_id: input.budgetId }));
      if (rows.length) {
        const { error: itemsError } = await client.from("budget_items").insert(rows);
        if (itemsError) throw new Error(itemsError.message);
      }
      return budget;
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
      const client = requireSupabase();
      const { data: budgetRow, error: budgetError } = await client
        .from("budgets")
        .insert(input.budget)
        .select()
        .single();
      if (budgetError) throw new Error(budgetError.message);
      const budget = budgetRow as Budget;
      const rows = input.items
        .filter((item) => item.planned_amount > 0)
        .map((item) => ({ ...item, budget_id: budget.id }));
      if (rows.length) {
        const { error: itemsError } = await client.from("budget_items").insert(rows);
        if (itemsError) throw new Error(itemsError.message);
      }
      return budget;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      queryClient.invalidateQueries({ queryKey: ["budget_items"] });
    },
  });
}
