/** Expense categories from the CornTrack product guide (§4, Step 2). */
export const EXPENSE_CATEGORIES = [
  "Seeds",
  "Fertilizer",
  "Pesticides",
  "Land preparation",
  "Labor",
  "Irrigation or fuel",
  "Harvesting",
  "Transportation",
  "Other farming expenses",
] as const;

/** CornPrice Watch product categories (§6). */
export const PRICE_CATEGORIES = [
  "Seeds",
  "Fertilizer",
  "Crop protection",
  "Other supplies",
  "Farmgate corn price",
] as const;

export const POST_KINDS = ["Tip", "Announcement", "Question"] as const;

export const BUYER_STATUSES = [
  "Accepting corn",
  "Interested",
  "Contacted",
  "Offer received",
  "Paused",
] as const;

export const FARMER_LISTING_STATUSES = ["Open to group sale", "Planning", "Sold harvest"] as const;

/** Category → icon name + color pair used across Records, Planner and Reports. */
export const CATEGORY_STYLE: Record<string, { bg: string; fg: string }> = {
  Seeds: { bg: "#fde68a", fg: "#92400e" },
  Fertilizer: { bg: "#bbf7d0", fg: "#166534" },
  Pesticides: { bg: "#e9d5ff", fg: "#6b21a8" },
  "Land preparation": { bg: "#fed7aa", fg: "#9a3412" },
  Labor: { bg: "#bfdbfe", fg: "#1e40af" },
  "Irrigation or fuel": { bg: "#a5f3fc", fg: "#155e75" },
  Harvesting: { bg: "#fbcfe8", fg: "#9d174d" },
  Transportation: { bg: "#ddd6fe", fg: "#5b21b6" },
  "Other farming expenses": { bg: "#e5e7eb", fg: "#374151" },
  "Crop protection": { bg: "#e9d5ff", fg: "#6b21a8" },
  "Other supplies": { bg: "#e5e7eb", fg: "#374151" },
  "Farmgate corn price": { bg: "#fef3c7", fg: "#b45309" },
};

export function categoryStyle(category: string) {
  return CATEGORY_STYLE[category] ?? CATEGORY_STYLE["Other farming expenses"];
}
