import { useMemo, useState } from "react";
import {
  Handshake,
  MapPin,
  Package,
  Phone,
  Plus,
  Scale,
  Trash2,
  Truck,
  UserRound,
  Users,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useBuyers, useDeleteRow, useFarmerListings, useInsertRow, useUpdateRow } from "@/lib/data";
import { BUYER_STATUSES, FARMER_LISTING_STATUSES } from "@/lib/constants";
import { formatDate, kg, peso } from "@/lib/format";
import type { Buyer, BuyerInsert, FarmerListing, FarmerListingInsert } from "@/lib/types";
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
  TextArea,
  TinyStat,
  formNumber,
  formText,
} from "@/components/ui";

type CompareRow = { buyer: Buyer; transport: number; deductions: number };

/** CornBulk Connect (guide §7): farmers, buyers, transport estimates, comparison. */
export default function Bulk() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: farmers = [], isLoading: loadingFarmers } = useFarmerListings();
  const { data: buyers = [], isLoading: loadingBuyers } = useBuyers();

  const insertFarmer = useInsertRow<FarmerListingInsert>("farmer_listings");
  const deleteFarmer = useDeleteRow("farmer_listings");
  const insertBuyer = useInsertRow<BuyerInsert>("buyers");
  const updateBuyer = useUpdateRow<Partial<Buyer> & { id: string }>("buyers");
  const deleteBuyer = useDeleteRow("buyers");

  const [tab, setTab] = useState<"farmers" | "buyers">("farmers");
  const [viewFarmer, setViewFarmer] = useState<FarmerListing | null>(null);
  const [viewBuyer, setViewBuyer] = useState<Buyer | null>(null);
  const [transportBuyer, setTransportBuyer] = useState<Buyer | null>(null);
  const [farmerSheet, setFarmerSheet] = useState(false);
  const [buyerSheet, setBuyerSheet] = useState<{ open: boolean; editing: Buyer | null }>({
    open: false,
    editing: null,
  });

  // Group-selling calculator (guide §7, step 2A)
  const [groupPick, setGroupPick] = useState<Set<string>>(new Set());
  const [myHarvest, setMyHarvest] = useState("");

  // Buyer comparison (guide §7, step 5)
  const [compareRows, setCompareRows] = useState<CompareRow[]>([]);
  const [compareQty, setCompareQty] = useState("");

  const fail = (error: unknown) =>
    toast({
      title: "Could not save",
      description: error instanceof Error ? error.message : "Please try again.",
      variant: "error",
    });

  const groupTotal = useMemo(() => {
    const others = farmers
      .filter((row) => groupPick.has(row.id))
      .reduce((sum, row) => sum + row.expected_harvest_kg, 0);
    const mine = Number(myHarvest) || 0;
    return { others, mine, total: others + mine };
  }, [farmers, groupPick, myHarvest]);

  const saveFarmerListing = (form: FormData) => {
    if (!user) return;
    insertFarmer.mutate(
      {
        user_id: user.id,
        farmer_name: formText(form, "farmer_name") || "Anonymous farmer",
        location: formText(form, "location"),
        expected_harvest_kg: formNumber(form, "expected_harvest_kg"),
        harvest_date: formText(form, "harvest_date") || null,
        preferred_arrangement: formText(form, "preferred_arrangement"),
        contact_info: formText(form, "contact_info"),
        status: formText(form, "status"),
        notes: formText(form, "notes"),
      },
      {
        onSuccess: () => {
          toast({ title: "Listing shared", description: "Other farmers can now find you for a group sale." });
          setFarmerSheet(false);
        },
        onError: fail,
      }
    );
  };

  const saveBuyer = (form: FormData) => {
    if (!user) return;
    const phone = formText(form, "phone");
    const email = formText(form, "email");
    if (!phone && !email) {
      toast({
        title: "Add buyer contact details",
        description: "Enter a phone number or email so farmers can follow up.",
        variant: "error",
      });
      return;
    }
    const row = {
      user_id: user.id,
      buyer_name: formText(form, "buyer_name"),
      contact_name: formText(form, "contact_name"),
      phone,
      email,
      location: formText(form, "location"),
      offered_price_per_kg: formNumber(form, "offered_price_per_kg"),
      quantity_kg: formNumber(form, "quantity_kg"),
      min_quantity_kg: formNumber(form, "min_quantity_kg"),
      status: formText(form, "status"),
      payment_terms: formText(form, "payment_terms"),
      deductions_note: formText(form, "deductions_note"),
      valid_until: formText(form, "valid_until") || null,
      notes: formText(form, "notes"),
    };
    const editing = buyerSheet.editing;
    const action = editing
      ? updateBuyer.mutateAsync({ ...row, id: editing.id })
      : insertBuyer.mutateAsync(row);
    action
      .then(() => {
        toast({ title: editing ? "Buyer updated" : "Buyer listing shared" });
        setBuyerSheet({ open: false, editing: null });
      })
      .catch(fail);
  };

  const bestRemaining = useMemo(() => {
    const qty = Number(compareQty) || 0;
    if (!qty || compareRows.length === 0) return null;
    const values = compareRows.map(
      (row) => qty * row.buyer.offered_price_per_kg - row.transport - row.deductions
    );
    return Math.max(...values);
  }, [compareRows, compareQty]);

  return (
    <div className="page-enter">
      <header className="mb-4">
        <a href="/" className="back-link">
          ← Back to Home
        </a>
        <h1 className="page-title">CornBulk Connect</h1>
        <p className="page-intro">Connect with farmers and find available buyers.</p>
      </header>

      {/* Two main sections (guide §7, step 1) */}
      <div className="segmented">
        <button
          className={`segment ${tab === "farmers" ? "active" : ""}`}
          onClick={() => setTab("farmers")}
          data-testid="tab-farmers"
        >
          <Users size={14} className="mr-1 inline" /> Find Other Farmers
        </button>
        <button
          className={`segment ${tab === "buyers" ? "active" : ""}`}
          onClick={() => setTab("buyers")}
          data-testid="tab-buyers"
        >
          <Handshake size={14} className="mr-1 inline" /> Buyers Available
        </button>
      </div>

      {/* ---------------------------- Farmers section ---------------------------- */}
      {tab === "farmers" ? (
        <>
          <button className="btn-primary mt-4 w-full" onClick={() => setFarmerSheet(true)} data-testid="button-add-farmer">
            <Plus size={16} /> Share my listing for group selling
          </button>

          <Card className="mt-4">
            <SectionTitle>Farmers near you</SectionTitle>
            {loadingFarmers ? (
              <div className="loading-block">Loading farmers…</div>
            ) : farmers.length ? (
              <div>
                {farmers.map((row) => (
                  <div key={row.id} className="row-item" data-testid={`row-farmer-${row.id}`}>
                    <input
                      type="checkbox"
                      className="group-check"
                      checked={groupPick.has(row.id)}
                      onChange={(event) => {
                        setGroupPick((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(row.id);
                          else next.delete(row.id);
                          return next;
                        });
                      }}
                      aria-label={`Include ${row.farmer_name} in group sale`}
                    />
                    <span className="row-icon" style={{ background: "#e1f3e6", color: "#1c7c3c" }}>
                      <UserRound size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="row-title">{row.farmer_name}</span>
                      <span className="row-sub block">
                        {row.location} · Expected harvest {kg(row.expected_harvest_kg)}
                        {row.harvest_date ? ` · ${formatDate(row.harvest_date)}` : ""}
                      </span>
                    </span>
                    <button className="row-edit" onClick={() => setViewFarmer(row)}>
                      View Profile
                    </button>
                    {user && row.user_id === user.id && (
                      <button
                        className="icon-btn icon-btn-danger"
                        aria-label="Delete my listing"
                        onClick={() => {
                          if (!window.confirm("Delete your farmer listing?")) return;
                          deleteFarmer.mutate(row.id, {
                            onSuccess: () => toast({ title: "Listing deleted" }),
                            onError: fail,
                          });
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Users size={20} />}
                title="No farmer listings yet"
                text="Share your own listing so nearby farmers can coordinate a group sale with you."
              />
            )}
          </Card>

          {/* Group sale calculator (guide §7, step 2A + step 6) */}
          <Card className="mt-4">
            <SectionTitle>
              <Scale size={15} className="mr-1 inline" /> Group sale calculator
            </SectionTitle>
            <Field
              label="Your expected harvest (kg)"
              name="my_harvest"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="e.g. 1000"
              value={myHarvest}
              onChange={setMyHarvest}
            />
            <div className="mt-3 grid grid-cols-3 gap-2">
              <TinyStat label="Yours" value={kg(groupTotal.mine)} />
              <TinyStat label="Other farmers" value={kg(groupTotal.others)} />
              <TinyStat label="Combined" value={kg(groupTotal.total)} />
            </div>
            <p className="mt-3 text-[10.5px] leading-relaxed text-[#75816f]">
              A combined sale may help meet a buyer&apos;s minimum quantity or share transport
              costs. Before confirming, the group must agree on price, quality, transport sharing
              and payment terms.
            </p>
          </Card>
        </>
      ) : (
        /* ----------------------------- Buyers section ----------------------------- */
        <>
          <button
            className="btn-primary mt-4 w-full"
            onClick={() => setBuyerSheet({ open: true, editing: null })}
            data-testid="button-add-buyer"
          >
            <Plus size={16} /> Share a buyer listing
          </button>

          <Card className="mt-4">
            <SectionTitle>Buyers accepting corn</SectionTitle>
            {loadingBuyers ? (
              <div className="loading-block">Loading buyers…</div>
            ) : buyers.length ? (
              <div>
                {buyers.map((row) => (
                  <div key={row.id} className="row-item" data-testid={`row-buyer-${row.id}`}>
                    <span className="row-icon" style={{ background: "#f1e6f8", color: "#7d2ea3" }}>
                      <Package size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="row-title">{row.buyer_name}</span>
                      <span className="row-sub block">
                        {row.location} · accepts up to {kg(row.quantity_kg)}
                        {row.min_quantity_kg > 0 ? ` · min ${kg(row.min_quantity_kg)}` : ""}
                      </span>
                      <span className="row-sub block">{row.status}</span>
                    </span>
                    <span className="text-right">
                      <b className="row-amount block">{peso(row.offered_price_per_kg, 2)}/kg</b>
                      <span className="mt-1 flex gap-1">
                        <button className="row-edit" onClick={() => setTransportBuyer(row)} data-testid={`button-location-${row.id}`}>
                          <MapPin size={12} className="mr-0.5 inline" /> Location
                        </button>
                        <button className="row-edit" onClick={() => setViewBuyer(row)} data-testid={`button-offer-${row.id}`}>
                          View Offer
                        </button>
                      </span>
                    </span>
                    {user && row.user_id === user.id && (
                      <button
                        className="icon-btn icon-btn-danger"
                        aria-label="Delete my buyer listing"
                        onClick={() => {
                          if (!window.confirm("Delete this buyer listing?")) return;
                          deleteBuyer.mutate(row.id, {
                            onSuccess: () => toast({ title: "Buyer listing deleted" }),
                            onError: fail,
                          });
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Handshake size={20} />}
                title="No buyer listings yet"
                text="Share a buyer you know, or check back later — listings are contributed by the community."
              />
            )}
            <p className="mt-3 text-[10px] leading-relaxed text-[#98a394]">
              Listings are community-contributed. Confirm price, moisture, weighing and payment
              terms directly with the buyer before agreeing to sell.
            </p>
          </Card>

          {/* Comparison (guide §7, step 5) */}
          <Card className="mt-4">
            <SectionTitle>Compare buyers</SectionTitle>
            <Field
              label="Quantity you plan to sell (kg)"
              name="compare_qty"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="e.g. 2000"
              value={compareQty}
              onChange={setCompareQty}
            />
            {compareRows.length === 0 ? (
              <p className="mt-3 text-[11.5px] leading-relaxed text-[#75816f]">
                Open <b>View Offer</b> on a buyer and tap <b>Add to comparison</b>. Estimated
                transport from the Location calculator is carried over.
              </p>
            ) : (
              <div className="mt-3 table-wrap">
                <table className="table" data-testid="table-buyer-compare">
                  <thead>
                    <tr>
                      <th>Detail</th>
                      {compareRows.map((row) => (
                        <th key={row.buyer.id}>{row.buyer.buyer_name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="muted">Offered price / kg</td>
                      {compareRows.map((row) => (
                        <td key={row.buyer.id} className="font-semibold">
                          {peso(row.buyer.offered_price_per_kg, 2)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="muted">Gross sale</td>
                      {compareRows.map((row) => (
                        <td key={row.buyer.id}>{peso((Number(compareQty) || 0) * row.buyer.offered_price_per_kg)}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="muted">Estimated transport</td>
                      {compareRows.map((row) => (
                        <td key={row.buyer.id}>
                          <input
                            className="field compare-input"
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={row.transport}
                            onChange={(event) =>
                              setCompareRows((current) =>
                                current.map((entry) =>
                                  entry.buyer.id === row.buyer.id
                                    ? { ...entry, transport: Number(event.target.value) || 0 }
                                    : entry
                                )
                              )
                            }
                          />
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="muted">Other deductions</td>
                      {compareRows.map((row) => (
                        <td key={row.buyer.id}>
                          <input
                            className="field compare-input"
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={row.deductions}
                            onChange={(event) =>
                              setCompareRows((current) =>
                                current.map((entry) =>
                                  entry.buyer.id === row.buyer.id
                                    ? { ...entry, deductions: Number(event.target.value) || 0 }
                                    : entry
                                )
                              )
                            }
                          />
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="font-bold">Estimated remaining</td>
                      {compareRows.map((row) => {
                        const remaining =
                          (Number(compareQty) || 0) * row.buyer.offered_price_per_kg -
                          row.transport -
                          row.deductions;
                        const isBest =
                          bestRemaining !== null &&
                          Math.abs(remaining - bestRemaining) < 0.01 &&
                          compareRows.length > 1;
                        return (
                          <td key={row.buyer.id}>
                            <b className={remaining >= 0 ? "text-[#1e8e3e]" : "text-[#d93025]"}>
                              {peso(remaining)}
                            </b>
                            {isBest && (
                              <span className="ml-1">
                                <Badge tone="green">Best</Badge>
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
                <div className="mt-2 flex justify-end">
                  <button className="btn-outline" onClick={() => setCompareRows([])}>
                    Clear comparison
                  </button>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-[#98a394]">
                  This is the amount after listed selling costs — not your final farm profit.
                  Production expenses are tracked separately in Farm Records.
                </p>
              </div>
            )}
          </Card>
        </>
      )}

      {/* --------------------------- Farmer profile sheet --------------------------- */}
      {viewFarmer && (
        <Sheet title={viewFarmer.farmer_name} close={() => setViewFarmer(null)}>
          <div className="grid grid-cols-2 gap-3">
            <TinyStat label="Expected harvest" value={kg(viewFarmer.expected_harvest_kg)} />
            <TinyStat label="Harvest date" value={viewFarmer.harvest_date ? formatDate(viewFarmer.harvest_date) : "Flexible"} />
          </div>
          <div className="mt-3">
            <div className="data-row text-xs">
              <span className="muted">Location</span>
              <b>{viewFarmer.location || "—"}</b>
            </div>
            <div className="data-row text-xs">
              <span className="muted">Preferred arrangement</span>
              <b>{viewFarmer.preferred_arrangement || "Group sale"}</b>
            </div>
            <div className="data-row text-xs">
              <span className="muted">Status</span>
              <b>{viewFarmer.status}</b>
            </div>
            <div className="data-row text-xs">
              <span className="muted">Contact (shared by the farmer)</span>
              <b>{viewFarmer.contact_info || "Not provided"}</b>
            </div>
          </div>
          {viewFarmer.notes && <p className="mt-3 text-[11.5px] leading-relaxed text-[#5c6b5e]">{viewFarmer.notes}</p>}
          <div className="notice mt-3">
            Only the information the farmer chose to share is shown. Agree on price, quality,
            transport and payment before committing to a group sale.
          </div>
          {viewFarmer.contact_info && (
            <a
              className="btn-primary mt-4 w-full"
              href={
                /^\d[\d\s+()-]*$/.test(viewFarmer.contact_info)
                  ? `tel:${viewFarmer.contact_info.replace(/\s/g, "")}`
                  : undefined
              }
            >
              <Phone size={15} /> Request to Connect
            </a>
          )}
        </Sheet>
      )}

      {/* ----------------------------- Buyer offer sheet ----------------------------- */}
      {viewBuyer && (
        <Sheet title={viewBuyer.buyer_name} close={() => setViewBuyer(null)}>
          <div className="grid grid-cols-2 gap-3">
            <TinyStat label="Offered price" value={`${peso(viewBuyer.offered_price_per_kg, 2)}/kg`} />
            <TinyStat label="Accepts up to" value={kg(viewBuyer.quantity_kg)} />
          </div>
          <div className="mt-3">
            <div className="data-row text-xs">
              <span className="muted">Location</span>
              <b>{viewBuyer.location || "—"}</b>
            </div>
            {viewBuyer.min_quantity_kg > 0 && (
              <div className="data-row text-xs">
                <span className="muted">Minimum quantity</span>
                <b>{kg(viewBuyer.min_quantity_kg)}</b>
              </div>
            )}
            <div className="data-row text-xs">
              <span className="muted">Payment terms</span>
              <b className="text-right">{viewBuyer.payment_terms || "Confirm with buyer"}</b>
            </div>
            <div className="data-row text-xs">
              <span className="muted">Deductions / fees</span>
              <b className="text-right">{viewBuyer.deductions_note || "None listed"}</b>
            </div>
            <div className="data-row text-xs">
              <span className="muted">Offer valid until</span>
              <b>{viewBuyer.valid_until ? formatDate(viewBuyer.valid_until) : "Not stated"}</b>
            </div>
            <div className="data-row text-xs">
              <span className="muted">Status</span>
              <b>{viewBuyer.status}</b>
            </div>
          </div>
          {(viewBuyer.phone || viewBuyer.email) && (
            <div className="mt-3 text-xs">
              <b>Contact:</b>{" "}
              {viewBuyer.phone && (
                <a className="contact-link" href={`tel:${viewBuyer.phone.replace(/\s/g, "")}`}>
                  {viewBuyer.phone}
                </a>
              )}
              {viewBuyer.phone && viewBuyer.email && " · "}
              {viewBuyer.email && (
                <a className="contact-link" href={`mailto:${viewBuyer.email}`}>
                  {viewBuyer.email}
                </a>
              )}
              {viewBuyer.contact_name ? ` (${viewBuyer.contact_name})` : ""}
            </div>
          )}
          {viewBuyer.notes && <p className="mt-3 text-[11.5px] leading-relaxed text-[#5c6b5e]">{viewBuyer.notes}</p>}
          <div className="notice notice-warn mt-3">
            Community-contributed listing — not a verified offer. Confirm quantity, moisture
            requirements, weighing and payment before loading your corn.
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              className="btn-outline"
              onClick={() => {
                setTransportBuyer(viewBuyer);
                setViewBuyer(null);
              }}
            >
              <MapPin size={13} /> Location &amp; transport
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                setCompareRows((current) =>
                  current.some((row) => row.buyer.id === viewBuyer.id)
                    ? current
                    : [...current, { buyer: viewBuyer, transport: 0, deductions: 0 }]
                );
                setTab("buyers");
                setViewBuyer(null);
                toast({ title: "Added to comparison", description: "Set transport and deductions in the comparison table." });
              }}
              data-testid={`button-compare-${viewBuyer.id}`}
            >
              Add to comparison
            </button>
          </div>
        </Sheet>
      )}

      {/* -------------------------- Transport calculator (guide §7, step 3) -------------------------- */}
      {transportBuyer && <TransportSheet buyer={transportBuyer} close={() => setTransportBuyer(null)} onCompare={(transport) => {
        setCompareRows((current) =>
          current.some((row) => row.buyer.id === transportBuyer.id)
            ? current.map((row) => (row.buyer.id === transportBuyer.id ? { ...row, transport } : row))
            : [...current, { buyer: transportBuyer, transport, deductions: 0 }]
        );
        setTab("buyers");
        setTransportBuyer(null);
        toast({ title: "Transport saved to comparison", description: `Estimated transport ${peso(transport)} for ${transportBuyer.buyer_name}.` });
      }} />}

      {/* ------------------------ Farmer listing form sheet ------------------------ */}
      {farmerSheet && (
        <Sheet title="Share my farmer listing" close={() => setFarmerSheet(false)}>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveFarmerListing(new FormData(event.currentTarget));
            }}
          >
            <Field label="Name shown to other farmers" name="farmer_name" required placeholder="e.g. Juan D. (barangay San Vicente)" />
            <Field label="General location" name="location" required placeholder="Municipality / barangay — no exact address" />
            <Field
              label="Expected harvest (kg)"
              name="expected_harvest_kg"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              required
              placeholder="e.g. 1200"
            />
            <Field label="Planned harvest date" name="harvest_date" type="date" />
            <SelectField
              label="Preferred selling arrangement"
              name="preferred_arrangement"
              defaultValue="Group sale"
              options={["Group sale", "Direct sale", "Flexible / open"]}
            />
            <SelectField label="Status" name="status" defaultValue="Open to group sale" options={FARMER_LISTING_STATUSES} />
            <Field label="Contact info you want to share" name="contact_info" placeholder="Mobile number or messenger name" />
            <TextArea label="Notes (optional)" name="notes" placeholder="Corn variety, drying arrangements, transport plans…" />
            <div className="notice">
              Share only what you are comfortable making public. CornTrack never shares your exact
              farm address or account details.
            </div>
            <SaveButton label="Share listing" pending={insertFarmer.isPending} testId="button-save-farmer" />
          </form>
        </Sheet>
      )}

      {/* -------------------------- Buyer listing form sheet -------------------------- */}
      {buyerSheet.open && (
        <Sheet
          title={buyerSheet.editing ? "Edit buyer listing" : "Share a buyer listing"}
          close={() => setBuyerSheet({ open: false, editing: null })}
        >
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveBuyer(new FormData(event.currentTarget));
            }}
          >
            <Field
              label="Buyer / business name"
              name="buyer_name"
              required
              defaultValue={buyerSheet.editing?.buyer_name ?? ""}
            />
            <Field label="Contact person" name="contact_name" defaultValue={buyerSheet.editing?.contact_name ?? ""} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone" name="phone" type="tel" defaultValue={buyerSheet.editing?.phone ?? ""} />
              <Field label="Email" name="email" type="email" defaultValue={buyerSheet.editing?.email ?? ""} />
            </div>
            <Field label="Location" name="location" required defaultValue={buyerSheet.editing?.location ?? ""} placeholder="Trading post, municipality, province" />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Offered price (₱/kg)"
                name="offered_price_per_kg"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                required
                defaultValue={buyerSheet.editing?.offered_price_per_kg ?? ""}
              />
              <Field
                label="Accepts up to (kg)"
                name="quantity_kg"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                required
                defaultValue={buyerSheet.editing?.quantity_kg ?? ""}
              />
              <Field
                label="Minimum quantity (kg)"
                name="min_quantity_kg"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                defaultValue={buyerSheet.editing?.min_quantity_kg ?? 0}
              />
              <Field label="Offer valid until" name="valid_until" type="date" defaultValue={buyerSheet.editing?.valid_until ?? ""} />
            </div>
            <SelectField
              label="Status"
              name="status"
              defaultValue={buyerSheet.editing?.status ?? "Accepting corn"}
              options={BUYER_STATUSES}
            />
            <Field
              label="Payment terms"
              name="payment_terms"
              placeholder="e.g. Cash on delivery, 7 days"
              defaultValue={buyerSheet.editing?.payment_terms ?? ""}
            />
            <Field
              label="Deductions / fees note"
              name="deductions_note"
              placeholder="e.g. Drying fee below 14% moisture"
              defaultValue={buyerSheet.editing?.deductions_note ?? ""}
            />
            <TextArea label="Notes" name="notes" placeholder="Quality and moisture requirements, hauling, weighing…" defaultValue={buyerSheet.editing?.notes ?? ""} />
            <div className="notice">Enter at least a phone number or email so farmers can follow up.</div>
            <SaveButton
              label="Save buyer listing"
              pending={insertBuyer.isPending || updateBuyer.isPending}
              testId="button-save-buyer"
            />
          </form>
        </Sheet>
      )}
    </div>
  );
}

/* ------------------------------ Transport sheet ------------------------------ */

function TransportSheet({
  buyer,
  close,
  onCompare,
}: {
  buyer: Buyer;
  close: () => void;
  onCompare: (transport: number) => void;
}) {
  const [mode, setMode] = useState<"own" | "hired">("own");
  const [distanceKm, setDistanceKm] = useState("25");
  const [fuelUse, setFuelUse] = useState("0.12");
  const [fuelPrice, setFuelPrice] = useState("60");
  const [otherExpenses, setOtherExpenses] = useState("0");
  const [deliveryFee, setDeliveryFee] = useState("");

  const roundTrip = (Number(distanceKm) || 0) * 2;
  const fuelCost = roundTrip * (Number(fuelUse) || 0) * (Number(fuelPrice) || 0);
  const other = Number(otherExpenses) || 0;
  const hiredFee = Number(deliveryFee) || 0;
  const total = mode === "own" ? fuelCost + other : hiredFee + other;

  return (
    <Sheet title={`Route to ${buyer.buyer_name}`} close={close}>
      <p className="text-[11.5px] leading-relaxed text-[#5c6b5e]">
        Estimate the transportation cost before deciding — a higher price per kg can be erased by a
        long trip.
      </p>

      <div className="segmented mt-3">
        <button className={`segment ${mode === "own" ? "active" : ""}`} onClick={() => setMode("own")} type="button">
          Own vehicle
        </button>
        <button className={`segment ${mode === "hired" ? "active" : ""}`} onClick={() => setMode("hired")} type="button">
          Hired delivery
        </button>
      </div>

      {mode === "own" ? (
        <div className="mt-4 grid gap-4">
          <label className="block">
            <span className="field-label">One-way distance (km)</span>
            <input className="field" type="number" min="0" step="any" inputMode="decimal" value={distanceKm} onChange={(event) => setDistanceKm(event.target.value)} />
            <span className="field-help">Round trip: {roundTrip} km</span>
          </label>
          <label className="block">
            <span className="field-label">Fuel use per km (liters)</span>
            <input className="field" type="number" min="0" step="0.01" inputMode="decimal" value={fuelUse} onChange={(event) => setFuelUse(event.target.value)} />
            <span className="field-help">Pickup ≈ 0.12 L/km · cargo truck ≈ 0.20 L/km — adjust for your vehicle.</span>
          </label>
          <label className="block">
            <span className="field-label">Fuel price (₱/liter)</span>
            <input className="field" type="number" min="0" step="0.01" inputMode="decimal" value={fuelPrice} onChange={(event) => setFuelPrice(event.target.value)} />
          </label>
        </div>
      ) : (
        <div className="mt-4">
          <label className="block">
            <span className="field-label">Quoted delivery fee (₱)</span>
            <input className="field" type="number" min="0" step="0.01" inputMode="decimal" placeholder="e.g. 1500" value={deliveryFee} onChange={(event) => setDeliveryFee(event.target.value)} />
          </label>
        </div>
      )}

      <label className="mt-4 block">
        <span className="field-label">Other transport expenses (₱)</span>
        <input className="field" type="number" min="0" step="0.01" inputMode="decimal" placeholder="Loading, tolls, snacks…" value={otherExpenses} onChange={(event) => setOtherExpenses(event.target.value)} />
      </label>

      <div className="mt-4 rounded-2xl bg-[#175a31] p-4 text-[#f2f8f4]">
        <div className="eyebrow" style={{ color: "#cfe4d6" }}>
          Estimated transportation cost
        </div>
        <div className="mt-1 text-[26px] font-extrabold" data-testid="text-transport-total">
          {peso(total)}
        </div>
        <div className="mt-2 text-[10.5px] leading-relaxed text-[#cfe4d6]">
          {mode === "own"
            ? `${roundTrip} km round trip × ${Number(fuelUse) || 0} L/km × ${peso(Number(fuelPrice) || 0, 2)}/L${other > 0 ? ` + ${peso(other)} other expenses` : ""}`
            : `Delivery fee ${peso(hiredFee)}${other > 0 ? ` + ${peso(other)} other expenses` : ""}`}
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-[#98a394]">
        This is an estimate, not a guaranteed amount. Road conditions, fuel prices, vehicle load and
        fees can change the actual cost.
      </p>

      <button className="btn-primary mt-4 w-full" onClick={() => onCompare(total)} data-testid="button-transport-compare">
        <Truck size={15} /> Use in buyer comparison
      </button>
    </Sheet>
  );
}
