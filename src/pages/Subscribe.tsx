import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  CreditCard,
  Crown,
  Heart,
  Info,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useInsertRow, useSubscription, useUpdateRow } from "@/lib/data";
import { peso } from "@/lib/format";
import {
  FREE_FOREVER_NOTE,
  isPaypalConfigured,
  nextPeriodEnd,
  PAYPAL_CLIENT_ID,
  PAYPAL_PLAN_ID,
  SUBSCRIPTION_FEATURES,
  SUBSCRIPTION_INTERVAL,
  SUBSCRIPTION_PLAN_NAME,
  SUBSCRIPTION_PRICE_PHP,
} from "@/lib/subscription";
import type { Subscription, SubscriptionInsert } from "@/lib/types";
import { useToast } from "@/components/Toast";
import { Badge, Card, SectionTitle, Sheet, StatCard } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";

/**
 * CornTrack Plus — ₱29/month subscription with PayPal.
 *
 * While PAYPAL_CLIENT_ID is still the placeholder, the PayPal button opens a
 * setup sheet instead of the real checkout: it explains exactly what to paste
 * where, and offers a test activation that writes the same subscription row a
 * real PayPal approval would, so the subscribed experience can be reviewed
 * end to end. With a real client id the same button loads the PayPal SDK.
 */
export default function Subscribe() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: subscription, isLoading } = useSubscription(user?.id);
  const insertSubscription = useInsertRow<SubscriptionInsert>("subscriptions");
  const updateSubscription = useUpdateRow<Partial<Subscription> & { id: string }>("subscriptions");
  const [paypalSheet, setPaypalSheet] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const active = subscription?.status === "active";
  const paypalReady = isPaypalConfigured();

  const startSubscription = (paypalSubscriptionId: string) => {
    if (!user) return;
    const now = new Date().toISOString();
    const row: SubscriptionInsert = {
      user_id: user.id,
      plan: "plus",
      status: "active",
      price_php: SUBSCRIPTION_PRICE_PHP,
      currency: "PHP",
      billing_interval: SUBSCRIPTION_INTERVAL,
      paypal_subscription_id: paypalSubscriptionId,
      current_period_start: now,
      current_period_end: nextPeriodEnd(),
    };
    insertSubscription.mutate(row, {
      onSuccess: () => {
        setPaypalSheet(false);
        toast({
          title: `${SUBSCRIPTION_PLAN_NAME} activated`,
          description: paypalSubscriptionId
            ? "Thank you for supporting CornTrack!"
            : "Test activation — no payment was collected.",
        });
      },
      onError: (error) =>
        toast({
          title: "Could not activate the subscription",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "error",
        }),
    });
  };

  const cancelSubscription = () => {
    if (!subscription) return;
    updateSubscription.mutate(
      { id: subscription.id, user_id: subscription.user_id, status: "canceled" },
      {
        onSuccess: () => {
          setCancelling(false);
          toast({ title: "Subscription canceled", description: "You keep access until the period ends." });
        },
        onError: (error) =>
          toast({
            title: "Could not cancel",
            description: error instanceof Error ? error.message : "Please try again.",
            variant: "error",
          }),
      }
    );
  };

  return (
    <div className="page-enter">
      <header className="mb-4">
        <a href="/more" className="back-link">
          ← Back to More
        </a>
        <h1 className="page-title">Subscription</h1>
        <p className="page-intro">
          {active ? "Your CornTrack Plus membership" : "Support CornTrack — every tool, offline mode included, is free."}
        </p>
      </header>

      {/* Free-forever notice — offline and every feature work without a subscription */}
      <div className="notice" data-testid="notice-free-forever">
        <Heart size={14} className="mr-1 inline" /> {FREE_FOREVER_NOTE}
      </div>

      {/* Plan card */}
      <div className="profit-hero" data-testid="subscription-plan">
        <div className="flex items-center gap-2">
          <span className="tile-icon" style={{ background: "#ffffff26" }}>
            <Crown size={17} />
          </span>
          <span className="eyebrow" style={{ color: "#cfe4d6" }}>
            {SUBSCRIPTION_PLAN_NAME}
          </span>
          {active && <Badge tone="gold">Active</Badge>}
        </div>
        <div className="profit-value" data-testid="subscription-price">
          {peso(SUBSCRIPTION_PRICE_PHP)}
          <span className="text-[15px] font-bold opacity-80"> /{SUBSCRIPTION_INTERVAL}</span>
        </div>
        <div className="profit-meta">
          Billed monthly through PayPal. Cancel anytime — you keep access until the end of the
          period you paid for.
        </div>
      </div>

      {/* Status while loading / subscribed */}
      {isLoading ? (
        <div className="loading-block mt-4">Loading subscription…</div>
      ) : subscription ? (
        <Card className="mt-4">
          <SectionTitle>
            <BadgeCheck size={15} className="mr-1 inline" /> Membership status
          </SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Status"
              value={subscription.status === "active" ? "Active" : "Canceled"}
              accent={subscription.status === "active" ? "green" : "red"}
            />
            <StatCard
              label="Renews on"
              value={
                subscription.status === "active" ? formatDate(subscription.current_period_end) : "—"
              }
              meta={`Since ${formatDateTime(subscription.current_period_start)}`}
              accent="blue"
            />
          </div>
          {subscription.status === "active" ? (
            <button
              className="btn-outline mt-4 w-full"
              onClick={() => setCancelling(true)}
              data-testid="button-cancel-subscription"
            >
              Cancel subscription
            </button>
          ) : (
            <div className="notice mt-3">
              This subscription was canceled. Subscribe again below to reactivate CornTrack Plus.
            </div>
          )}
        </Card>
      ) : null}

      {/* What ₱29 supports — nothing is locked without it */}
      <Card className="mt-4">
        <SectionTitle>
          <Sparkles size={15} className="mr-1 inline" /> What your ₱29 supports
        </SectionTitle>
        <div className="grid gap-2.5">
          {SUBSCRIPTION_FEATURES.map((feature) => (
            <div key={feature} className="flex items-start gap-2.5 text-[12px] leading-relaxed text-[#3f4f45]">
              <CheckCircle2 size={15} className="mt-0.5 flex-none text-[#1e8e3e]" />
              <span>{feature}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Subscribe / re-subscribe */}
      {(!subscription || subscription.status !== "active") && (
        <Card className="mt-4">
          <SectionTitle>Pay with PayPal</SectionTitle>
          <p className="text-[11.5px] leading-relaxed text-[#5c6b5e]">
            PayPal handles the payment — CornTrack never sees your card or bank details. A PayPal
            account or debit/credit card works.
          </p>
          <button
            className="btn-primary mt-3 w-full"
            onClick={() => setPaypalSheet(true)}
            data-testid="button-subscribe-paypal"
          >
            <CreditCard size={15} /> Subscribe with PayPal — {peso(SUBSCRIPTION_PRICE_PHP)}/month
          </button>
          {!paypalReady && (
            <p className="mt-2 text-center text-[10px] leading-relaxed text-[#98a394]">
              <Info size={10} className="mr-0.5 inline" />
              PayPal is not connected yet — the button explains the placeholder setup.
            </p>
          )}
        </Card>
      )}

      <div className="notice mt-4">
        <ShieldCheck size={14} className="mr-1 inline" />
        Subscriptions are recorded in your own Supabase account and protected by Row Level
        Security. Prices are in Philippine pesos.
      </div>

      {/* ---------------------- PayPal subscription sheet ---------------------- */}
      {paypalSheet && (
        <Sheet
          title={paypalReady ? "Subscribe with PayPal" : "Connect PayPal to charge ₱29/month"}
          close={() => setPaypalSheet(false)}
        >
          {paypalReady ? (
            <>
              <p className="text-[11.5px] leading-relaxed text-[#5c6b5e]">
                Confirm the {peso(SUBSCRIPTION_PRICE_PHP)} monthly authorization in the PayPal
                window below. CornTrack records your subscription the moment PayPal approves it.
              </p>
              <PaypalButtons
                planId={PAYPAL_PLAN_ID}
                onApprove={(subscriptionId) => startSubscription(subscriptionId)}
                onFailure={(message) =>
                  toast({ title: "PayPal checkout failed", description: message, variant: "error" })
                }
              />
            </>
          ) : (
            <>
              <p className="text-[11.5px] leading-relaxed text-[#5c6b5e]">
                This build ships with a <b>PayPal placeholder</b> — the checkout is wired up, but no
                real account is connected yet, so no money can be collected. To go live:
              </p>
              <ol className="mt-3 grid gap-2 text-[11.5px] leading-relaxed text-[#3f4f45]">
                <li>
                  <b>1.</b> Create a business account at <b>developer.paypal.com</b> and create a
                  REST app.
                </li>
                <li>
                  <b>2.</b> In Subscriptions, create a recurring plan:{" "}
                  {peso(SUBSCRIPTION_PRICE_PHP)} PHP / month, and copy its <b>Plan ID</b>.
                </li>
                <li>
                  <b>3.</b> Paste both into{" "}
                  <code className="font-mono text-[10.5px]">PAYPAL_CLIENT_ID</code> and{" "}
                  <code className="font-mono text-[10.5px]">PAYPAL_PLAN_ID</code> in{" "}
                  <code className="font-mono text-[10.5px]">src/lib/subscription.ts</code> and
                  redeploy.
                </li>
                <li>
                  <b>4.</b> This screen then shows the real PayPal button instead of these
                  instructions.
                </li>
              </ol>
              <div className="notice mt-3">
                Current client id:{" "}
                <span className="font-mono text-[10.5px] break-all">{PAYPAL_CLIENT_ID}</span>
              </div>

              <button
                className="btn-primary mt-4 w-full"
                onClick={() => startSubscription("")}
                disabled={insertSubscription.isPending}
                data-testid="button-subscribe-test"
              >
                {insertSubscription.isPending
                  ? "Activating…"
                  : `Activate ${SUBSCRIPTION_PLAN_NAME} in test mode`}
              </button>
              <p className="mt-2 text-center text-[10px] leading-relaxed text-[#98a394]">
                Test mode records the subscription in your database exactly like a real approval
                would, but collects no payment. Cancel it any time from the status card.
              </p>
            </>
          )}
        </Sheet>
      )}

      {/* -------------------------- Cancel confirm sheet -------------------------- */}
      {cancelling && subscription && (
        <Sheet title="Cancel CornTrack Plus?" close={() => setCancelling(false)}>
          <p className="text-[11.5px] leading-relaxed text-[#5c6b5e]">
            Your membership stays active until{" "}
            <b>{formatDate(subscription.current_period_end)}</b> — the period you already paid for.
            After that, no further {peso(SUBSCRIPTION_PRICE_PHP)} charges are made.
          </p>
          <button
            className="btn-primary mt-4 w-full"
            onClick={cancelSubscription}
            disabled={updateSubscription.isPending}
            data-testid="button-confirm-cancel"
          >
            {updateSubscription.isPending ? "Canceling…" : "Yes, cancel my subscription"}
          </button>
          <button className="btn-outline mt-2 w-full" onClick={() => setCancelling(false)}>
            Keep my subscription
          </button>
        </Sheet>
      )}
    </div>
  );
}

/* --------------------- Live PayPal buttons (when configured) --------------------- */

type PayPalSdk = {
  Buttons: (options: {
    style?: Record<string, string>;
    createSubscription: (data: unknown, actions: { subscription: { create: (options: { plan_id: string }) => Promise<string> } }) => Promise<string>;
    onApprove: (data: { subscriptionID: string }) => void;
    onError?: (error: unknown) => void;
    onCancel?: () => void;
  }) => { render: (target: HTMLElement) => Promise<void> };
};

/**
 * Loads the PayPal subscription SDK and renders the official buttons.
 * Only reachable when PAYPAL_CLIENT_ID / PAYPAL_PLAN_ID are real values —
 * with the placeholders the subscribe sheet shows setup instructions instead.
 */
function PaypalButtons({
  planId,
  onApprove,
  onFailure,
}: {
  planId: string;
  onApprove: (subscriptionId: string) => void;
  onFailure: (message: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Loading PayPal…");

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      try {
        if (!window.paypal) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
              PAYPAL_CLIENT_ID
            )}&vault=true&intent=subscription`;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("PayPal SDK failed to load — check the client id."));
            document.head.appendChild(script);
          });
        }
        const sdk = window.paypal as PayPalSdk;
        if (cancelled || !container.current) return;
        await sdk
          .Buttons({
            style: { shape: "pill", color: "gold", label: "paypal" },
            createSubscription: (_data, actions) =>
              actions.subscription.create({ plan_id: planId }),
            onApprove: (data) => onApprove(data.subscriptionID),
            onError: (error) =>
              onFailure(error instanceof Error ? error.message : "Unknown PayPal error."),
            onCancel: () => onFailure("PayPal checkout was closed before approval."),
          })
          .render(container.current);
        setStatus("");
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "PayPal could not be loaded.");
        }
      }
    };
    void render();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  return (
    <div className="mt-3">
      <div ref={container} data-testid="paypal-buttons" />
      {status && <div className="loading-block">{status}</div>}
    </div>
  );
}
