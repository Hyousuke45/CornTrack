import { useMemo, useState } from "react";
import {
  BellRing,
  CheckCircle2,
  CircleDashed,
  MapPin,
  Plus,
  Store,
  Trash2,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/auth/AuthContext";
import {
  useDeleteRow,
  useInsertRow,
  usePriceAlerts,
  usePrices,
  useUpdateRow,
} from "@/lib/data";
import { PRICE_CATEGORIES } from "@/lib/constants";
import { formatDate, peso, timeAgo, todayInPhilippines } from "@/lib/format";
import type { PriceAlert, PriceAlertInsert, ProductPrice, ProductPriceInsert } from "@/lib/types";
import { useToast } from "@/components/Toast";
import {
  Badge,
  Card,
  EmptyState,
  Field,
  SaveButton,
  SectionTitle,
  SelectField,
  Sheet,
  formNumber,
  formText,
} from "@/components/ui";

/** CornPrice Watch (guide §6): shared supply price reports with source + date. */
export default function Prices() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: prices = [], isLoading } = usePrices();
  const { data: alerts = [] } = usePriceAlerts(user?.id);

  const insertPrice = useInsertRow<ProductPriceInsert>("product_prices");
  const updatePrice = useUpdateRow<Partial<ProductPrice> & { id: string }>("product_prices");
  const deletePrice = useDeleteRow("product_prices");
  const insertAlert = useInsertRow<PriceAlertInsert>("price_alerts");
  const deleteAlert = useDeleteRow("price_alerts");

  const [category, setCategory] = useState<string>("All");
  const [location, setLocation] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<ProductPrice | null>(null);
  const [reportSheet, setReportSheet] = useState<{ open: boolean; editing: ProductPrice | null }>({
    open: false,
    editing: null,
  });
  const [alertSheet, setAlertSheet] = useState(false);

  const locations = useMemo(
    () => Array.from(new Set(prices.map((row) => row.location).filter(Boolean))).sort(),
    [prices]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return prices.filter((row) => {
      if (category !== "All" && row.category !== category) return false;
      if (location !== "All" && row.location !== location) return false;
      if (query) {
        const haystack = `${row.product_name} ${row.store_or_market} ${row.location}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [prices, category, location, search]);

  const history = useMemo(() => {
    if (!detail) return [];
    return prices
      .filter((row) => row.product_name.toLowerCase() === detail.product_name.toLowerCase())
      .sort((a, b) => a.reported_at.localeCompare(b.reported_at))
      .map((row) => ({ date: row.reported_at.slice(5), price: row.price }));
  }, [prices, detail]);

  const fail = (error: unknown) =>
    toast({
      title: "Could not save",
      description: error instanceof Error ? error.message : "Please try again.",
      variant: "error",
    });

  const saveReport = (form: FormData) => {
    if (!user) return;
    const row = {
      user_id: user.id,
      product_name: formText(form, "product_name"),
      category: formText(form, "category"),
      price: formNumber(form, "price"),
      unit: formText(form, "unit") || "unit",
      store_or_market: formText(form, "store_or_market"),
      location: formText(form, "location"),
      source: formText(form, "source") || "Farmer-submitted report",
      is_verified: false,
      reported_at: formText(form, "reported_at") || todayInPhilippines(),
    };
    const editing = reportSheet.editing;
    const action = editing
      ? updatePrice.mutateAsync({ ...row, id: editing.id })
      : insertPrice.mutateAsync(row);
    action
      .then(() => {
        toast({
          title: editing ? "Price report updated" : "Price report added",
          description: "Thank you for sharing — it is marked unverified until confirmed.",
        });
        setReportSheet({ open: false, editing: null });
      })
      .catch(fail);
  };

  const saveAlert = (form: FormData) => {
    if (!user) return;
    insertAlert.mutate(
      {
        user_id: user.id,
        product_name: formText(form, "product_name"),
        target_price: formNumber(form, "target_price"),
        unit: formText(form, "unit") || "kg",
        location: formText(form, "location"),
        is_active: true,
      },
      {
        onSuccess: () => {
          toast({ title: "Price alert saved", description: "Check the alert list when new reports arrive." });
          setAlertSheet(false);
        },
        onError: fail,
      }
    );
  };

  const isAlertMet = (alert: PriceAlert) =>
    prices.some(
      (row) =>
        row.product_name.toLowerCase().includes(alert.product_name.toLowerCase()) &&
        row.price <= alert.target_price
    );

  return (
    <div className="page-enter">
      <header className="mb-4">
        <a href="/" className="back-link">
          ← Back to Home
        </a>
        <h1 className="page-title">CornPrice Watch</h1>
        <p className="page-intro">Check available prices before buying farming supplies.</p>
      </header>

      {/* Location selector (guide §6, step 2) */}
      <div className="chip-row mb-2">
        <button className={`chip ${location === "All" ? "active" : ""}`} onClick={() => setLocation("All")}>
          <MapPin size={12} className="mr-1 inline" /> All locations
        </button>
        {locations.map((name) => (
          <button
            key={name}
            className={`chip ${location === name ? "active" : ""}`}
            onClick={() => setLocation(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {/* Category browse (guide §6, step 3) */}
      <div className="chip-row mb-3">
        {["All", ...PRICE_CATEGORIES].map((name) => (
          <button
            key={name}
            className={`chip ${category === name ? "active" : ""}`}
            onClick={() => setCategory(name)}
            data-testid={`chip-price-category-${name}`}
          >
            {name}
          </button>
        ))}
      </div>

      <input
        className="field mb-3"
        placeholder="Search product, store or location…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        data-testid="input-price-search"
      />

      <div className="grid grid-cols-2 gap-3">
        <button
          className="btn-primary"
          onClick={() => setReportSheet({ open: true, editing: null })}
          data-testid="button-add-price"
        >
          <Plus size={16} /> Add price report
        </button>
        <button className="btn-primary btn-gold" onClick={() => setAlertSheet(true)} data-testid="button-add-alert">
          <BellRing size={15} /> Set price alert
        </button>
      </div>

      {/* Listings */}
      <Card className="mt-4">
        <SectionTitle>
          {category === "All" ? "All price reports" : `${category} prices`}
          <span className="faint text-[11px] font-normal">
            {filtered.length} report{filtered.length === 1 ? "" : "s"}
          </span>
        </SectionTitle>
        {isLoading ? (
          <div className="loading-block">Loading prices…</div>
        ) : filtered.length ? (
          <div>
            {filtered.map((row) => (
              <button
                key={row.id}
                className="row-item w-full text-left"
                onClick={() => setDetail(row)}
                data-testid={`row-price-${row.id}`}
              >
                <span
                  className="row-icon"
                  style={{ background: "#fdf3d7", color: "#9c6d05" }}
                >
                  <Store size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="row-title">{row.product_name}</span>
                  <span className="row-sub block">
                    {row.store_or_market} · {row.location} · {timeAgo(row.reported_at)}
                  </span>
                </span>
                <span className="text-right">
                  <b className="row-amount block">{peso(row.price, 2)}</b>
                  <span className="text-[10px] text-[#98a394]">/ {row.unit}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<TrendingUp size={20} />}
            title="No price reports yet"
            text="Add a price report from a store, trading post or buyer quote you have seen. Reports are shared with other CornTrack farmers and marked unverified until confirmed."
          />
        )}
      </Card>

      {/* Alerts */}
      <Card className="mt-4">
        <SectionTitle>Price alerts</SectionTitle>
        {alerts.length ? (
          <div>
            {alerts.map((alert) => (
              <div key={alert.id} className="row-item" data-testid={`row-alert-${alert.id}`}>
                <span
                  className="row-icon"
                  style={{
                    background: isAlertMet(alert) ? "#e1f3e6" : "#eef1ea",
                    color: isAlertMet(alert) ? "#1c7c3c" : "#75816f",
                  }}
                >
                  {isAlertMet(alert) ? <CheckCircle2 size={17} /> : <CircleDashed size={17} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="row-title">{alert.product_name}</span>
                  <span className="row-sub block">
                    Target {peso(alert.target_price, 2)}/{alert.unit}
                    {alert.location ? ` · ${alert.location}` : ""}
                  </span>
                </span>
                {isAlertMet(alert) ? (
                  <Badge tone="green">Target met</Badge>
                ) : (
                  <Badge>Watching</Badge>
                )}
                <button
                  className="icon-btn icon-btn-danger"
                  aria-label="Delete alert"
                  onClick={() => {
                    if (!window.confirm("Delete this price alert?")) return;
                    deleteAlert.mutate(alert.id, {
                      onSuccess: () => toast({ title: "Alert deleted" }),
                      onError: fail,
                    });
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<BellRing size={20} />}
            title="No alerts yet"
            text="Set a target price for a product — when a shared report meets your target, the alert is marked “Target met”."
          />
        )}
        <p className="mt-3 text-[10px] leading-relaxed text-[#98a394]">
          Alerts need updated price reports. If nobody submits a new report, CornTrack cannot detect
          a change.
        </p>
      </Card>

      {/* Listing detail with price history (guide §6, steps 4 & 7) */}
      {detail && (
        <Sheet title={detail.product_name} close={() => setDetail(null)}>
          <div className="grid grid-cols-2 gap-3">
            <div className="tiny-stat">
              <div className="tiny-label">Reported price</div>
              <div className="tiny-value">
                {peso(detail.price, 2)} / {detail.unit}
              </div>
            </div>
            <div className="tiny-stat">
              <div className="tiny-label">Verified?</div>
              <div className="tiny-value">
                {detail.is_verified ? "Verified report" : "Unverified report"}
              </div>
            </div>
          </div>
          <div className="mt-3">
            <div className="data-row text-xs">
              <span className="muted">Category</span>
              <b>{detail.category}</b>
            </div>
            <div className="data-row text-xs">
              <span className="muted">Store / market</span>
              <b>{detail.store_or_market || "—"}</b>
            </div>
            <div className="data-row text-xs">
              <span className="muted">Location</span>
              <b>{detail.location || "—"}</b>
            </div>
            <div className="data-row text-xs">
              <span className="muted">Reported on</span>
              <b>{formatDate(detail.reported_at)}</b>
            </div>
            <div className="data-row text-xs">
              <span className="muted">Source</span>
              <b className="text-right">{detail.source || "—"}</b>
            </div>
          </div>
          <div className="notice mt-3">
            Prices vary by brand, package size, location and delivery fees. Compare the total cost
            of buying, not only the listed price.
          </div>

          {history.length > 1 && (
            <div className="mt-4">
              <SectionTitle>Price history</SectionTitle>
              <div className="h-[180px]" data-testid="chart-price-history">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid stroke="#eef0ea" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#98a394" }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#98a394" }}
                      axisLine={false}
                      tickLine={false}
                      domain={["auto", "auto"]}
                    />
                    <ChartTooltip
                      formatter={(value) => [peso(Number(value ?? 0), 2), "Price"]}
                      contentStyle={{ borderRadius: 10, border: "1px solid #e6e9e2", fontSize: 11 }}
                    />
                    <Line type="monotone" dataKey="price" stroke="#1e6b3c" strokeWidth={2.4} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {user && detail.user_id === user.id && (
            <div className="mt-4 flex gap-2">
              <button
                className="btn-outline flex-1"
                onClick={() => {
                  setReportSheet({ open: true, editing: detail });
                  setDetail(null);
                }}
              >
                Edit report
              </button>
              <button
                className="btn-outline flex-1"
                onClick={() => {
                  if (!window.confirm("Delete this price report?")) return;
                  deletePrice.mutate(detail.id, {
                    onSuccess: () => toast({ title: "Price report deleted" }),
                    onError: fail,
                  });
                  setDetail(null);
                }}
              >
                <Trash2 size={13} /> Delete
              </button>
            </div>
          )}
        </Sheet>
      )}

      {/* Add / edit report sheet */}
      {reportSheet.open && (
        <Sheet
          title={reportSheet.editing ? "Edit price report" : "Add price report"}
          close={() => setReportSheet({ open: false, editing: null })}
        >
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveReport(new FormData(event.currentTarget));
            }}
          >
            <Field
              label="Product name"
              name="product_name"
              required
              placeholder="e.g. Complete fertilizer 14-14-14"
              defaultValue={reportSheet.editing?.product_name ?? ""}
            />
            <SelectField
              label="Category"
              name="category"
              defaultValue={reportSheet.editing?.category ?? "Fertilizer"}
              options={PRICE_CATEGORIES}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Price (₱)"
                name="price"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                required
                defaultValue={reportSheet.editing?.price ?? ""}
              />
              <Field
                label="Unit"
                name="unit"
                required
                placeholder="e.g. 50 kg bag"
                defaultValue={reportSheet.editing?.unit ?? ""}
              />
            </div>
            <Field
              label="Store or market"
              name="store_or_market"
              required
              placeholder="Agri supply, trading post, buyer…"
              defaultValue={reportSheet.editing?.store_or_market ?? ""}
            />
            <Field
              label="Location"
              name="location"
              required
              placeholder="Municipality, province"
              defaultValue={reportSheet.editing?.location ?? ""}
            />
            <Field
              label="Source"
              name="source"
              placeholder="Who provided this price?"
              defaultValue={reportSheet.editing?.source ?? ""}
            />
            <Field
              label="Reported date"
              name="reported_at"
              type="date"
              required
              defaultValue={reportSheet.editing?.reported_at ?? todayInPhilippines()}
            />
            <div className="notice">
              Farmer-submitted reports are shared with other users and marked <b>unverified</b>{" "}
              until confirmed. Always show the source and date — never treat an outdated price as
              the latest.
            </div>
            <SaveButton
              label="Save price report"
              pending={insertPrice.isPending || updatePrice.isPending}
              testId="button-save-price"
            />
          </form>
        </Sheet>
      )}

      {/* Alert sheet */}
      {alertSheet && (
        <Sheet title="Set price alert" close={() => setAlertSheet(false)}>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveAlert(new FormData(event.currentTarget));
            }}
          >
            <Field
              label="Product to watch"
              name="product_name"
              required
              placeholder="e.g. Hybrid corn seed"
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Target price (₱)"
                name="target_price"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                required
                placeholder="e.g. 900"
              />
              <Field label="Unit" name="unit" placeholder="per bag / kg" required />
            </div>
            <Field label="Location (optional)" name="location" placeholder="Municipality or area" />
            <div className="notice">
              You will see “Target met” on this page whenever a shared report for the product is at
              or below your target price.
            </div>
            <SaveButton label="Save alert" pending={insertAlert.isPending} testId="button-save-alert" />
          </form>
        </Sheet>
      )}
    </div>
  );
}
