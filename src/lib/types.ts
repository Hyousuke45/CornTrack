/**
 * Database row types for CornTrack.
 * These mirror `supabase/schema.sql` exactly — keep both in sync.
 */

export type Profile = {
  id: string; // = auth.users.id
  full_name: string;
  phone: string;
  province: string;
  municipality: string;
  farm_name: string;
  farm_size_ha: number;
  corn_variety: string;
  created_at: string;
  updated_at: string;
};

export type Expense = {
  id: string;
  user_id: string;
  category: string; // one of EXPENSE_CATEGORIES
  amount: number;
  expense_date: string; // YYYY-MM-DD
  notes: string;
  created_at: string;
};

export type Income = {
  id: string;
  user_id: string;
  selling_date: string; // YYYY-MM-DD
  quantity_kg: number;
  price_per_kg: number;
  total_amount: number;
  deductions: number;
  buyer_name: string;
  notes: string;
  created_at: string;
};

export type Budget = {
  id: string;
  user_id: string;
  season_name: string;
  farm_area_ha: number;
  planned_planting_date: string | null;
  available_budget: number;
  expected_yield_kg: number;
  expected_price_per_kg: number;
  status: "active" | "archived";
  created_at: string;
};

export type BudgetItem = {
  id: string;
  budget_id: string;
  category: string;
  planned_amount: number;
  notes: string;
};

export type ProductPrice = {
  id: string;
  user_id: string;
  product_name: string;
  category: string; // one of PRICE_CATEGORIES
  price: number;
  unit: string;
  store_or_market: string;
  location: string;
  source: string;
  is_verified: boolean;
  reported_at: string; // YYYY-MM-DD
  created_at: string;
};

export type PriceAlert = {
  id: string;
  user_id: string;
  product_name: string;
  target_price: number;
  unit: string;
  location: string;
  is_active: boolean;
  created_at: string;
};

export type Buyer = {
  id: string;
  user_id: string;
  buyer_name: string;
  contact_name: string;
  phone: string;
  email: string;
  location: string;
  offered_price_per_kg: number;
  quantity_kg: number;
  min_quantity_kg: number;
  status: string;
  payment_terms: string;
  deductions_note: string;
  valid_until: string | null;
  notes: string;
  created_at: string;
};

export type FarmerListing = {
  id: string;
  user_id: string;
  farmer_name: string;
  location: string;
  expected_harvest_kg: number;
  harvest_date: string | null;
  preferred_arrangement: string;
  contact_info: string;
  status: string;
  notes: string;
  created_at: string;
};

export type CommunityPost = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  author_name: string;
  location: string;
  kind: string; // Tip | Announcement | Question
  created_at: string;
};

/* ------------------------- Insert payload types ------------------------- */
/* Rows are created without id / created_at — Supabase generates them. */

export type ProfileInsert = Omit<Profile, "created_at" | "updated_at">;
export type ExpenseInsert = Omit<Expense, "id" | "created_at">;
export type IncomeInsert = Omit<Income, "id" | "created_at">;
export type ProductPriceInsert = Omit<ProductPrice, "id" | "created_at">;
export type PriceAlertInsert = Omit<PriceAlert, "id" | "created_at">;
export type BuyerInsert = Omit<Buyer, "id" | "created_at">;
export type FarmerListingInsert = Omit<FarmerListing, "id" | "created_at">;
export type CommunityPostInsert = Omit<CommunityPost, "id" | "created_at">;
