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

async function selectPrivate<T>(
  table: TableName,
  userId: string,
  order: string
): Promise<T[]> {
  const { data, error } = await requireSupabase()
    .from(table)
    .select("*")
    .eq("user_id", userId)
    .order(order, { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

async function selectShared<T>(table: TableName, order: string): Promise<T[]> {
  const { data, error } = await requireSupabase()
    .from(table)
    .select("*")
    .order(order, { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
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
      return (data as Profile | null) ?? null;
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
      return data as Profile;
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
      selectPrivate<Expense>(
        "expenses",
        userId as string,
        "expense_date desc,created_at desc"
      ),
  });
}

export function useIncomes(userId: string | undefined) {
  return useQuery({
    queryKey: ["incomes", userId],
    enabled: Boolean(userId),
    queryFn: () =>
      selectPrivate<Income>("incomes", userId as string, "selling_date desc,created_at desc"),
  });
}

export function useBudgets(userId: string | undefined) {
  return useQuery({
    queryKey: ["budgets", userId],
    enabled: Boolean(userId),
    queryFn: () =>
      selectPrivate<Budget>("budgets", userId as string, "created_at desc"),
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
      return (data ?? []) as BudgetItem[];
    },
  });
}

export function usePriceAlerts(userId: string | undefined) {
  return useQuery({
    queryKey: ["price_alerts", userId],
    enabled: Boolean(userId),
    queryFn: () => selectPrivate<PriceAlert>("price_alerts", userId as string, "created_at desc"),
  });
}

/* -------------------------------- Shared data -------------------------------- */

export function usePrices() {
  return useQuery({
    queryKey: ["product_prices"],
    queryFn: () => selectShared<ProductPrice>("product_prices", "reported_at desc,created_at desc"),
  });
}

export function useBuyers() {
  return useQuery({
    queryKey: ["buyers"],
    queryFn: () => selectShared<Buyer>("buyers", "created_at desc"),
  });
}

export function useFarmerListings() {
  return useQuery({
    queryKey: ["farmer_listings"],
    queryFn: () => selectShared<FarmerListing>("farmer_listings", "created_at desc"),
  });
}

export function usePosts() {
  return useQuery({
    queryKey: ["community_posts"],
    queryFn: () => selectShared<CommunityPost>("community_posts", "created_at desc"),
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
      return data as T & { id: string };
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
      return data as T;
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
