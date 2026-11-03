/**
 * CornTrack Plus subscription — ₱29/month via PayPal.
 *
 * CornTrack Plus is a voluntary supporter membership, NOT a paywall: every
 * feature — offline recording and sync included — is free for every farmer.
 *
 * PAYPAL SETUP (placeholder until you connect a real account):
 *   1. Create a business account at https://developer.paypal.com.
 *   2. Create a REST app → copy its Client ID.
 *   3. Replace PAYPAL_CLIENT_ID below (and see /subscribe for the flow).
 * Until then the app shows the placeholder flow: the plan, the price and the
 * database records all work; the PayPal button explains what is missing and
 * offers a test activation so the full subscribed experience can be reviewed.
 */

/** Monthly price in Philippine pesos. */
export const SUBSCRIPTION_PRICE_PHP = 29;

/** Plan name shown across the app. */
export const SUBSCRIPTION_PLAN_NAME = "CornTrack Plus";

/** Billing period label. */
export const SUBSCRIPTION_INTERVAL = "monthly";

/** PayPal REST app client id — replace to enable live payments. */
export const PAYPAL_CLIENT_ID = "YOUR_PAYPAL_CLIENT_ID";

/**
 * Id of the ₱29/month recurring plan created in your PayPal business account
 * (Subscriptions → Plans). Needed only once PAYPAL_CLIENT_ID is set.
 */
export const PAYPAL_PLAN_ID = "YOUR_PAYPAL_PLAN_ID";

/** True once a real PayPal client id has been pasted in. */
export function isPaypalConfigured(): boolean {
  return PAYPAL_CLIENT_ID.startsWith("AY") || PAYPAL_CLIENT_ID.length > 40;
}

/** Shown on the subscribe screen: nothing is locked behind the subscription. */
export const FREE_FOREVER_NOTE =
  "Every CornTrack feature is free — recording, reports, prices, buyers, and offline mode with automatic sync. CornTrack Plus is a voluntary way to support the app for ₱29/month.";

/** What supporters' ₱29 funds (no feature is withheld without it). */
export const SUBSCRIPTION_FEATURES = [
  "Keeps CornTrack free for every farmer — including offline recording and sync",
  "Funds Supabase hosting, updates and new features",
  "Early access to new tools before they ship to everyone",
  "Priority help if something goes wrong with your account or data",
  "A say in what gets built next — supporters' requests come first",
] as const;

/** Period end for a new monthly subscription, ISO timestamp. */
export function nextPeriodEnd(startMs = Date.now()): string {
  return new Date(startMs + 30 * 24 * 60 * 60 * 1000).toISOString();
}
