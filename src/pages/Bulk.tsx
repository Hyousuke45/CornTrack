import { useMemo, useState } from "react";
import {
  Crosshair,
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
import {
  useBuyers,
  useDeleteRow,
  useFarmerListings,
  useInsertRow,
  useProfile,
  useUpdateRow,
} from "@/lib/data";
import { BUYER_STATUSES, FARMER_LISTING_STATUSES } from "@/lib/constants";
import { formatDate, kg, peso, todayInPhilippines } from "@/lib/format";
import {
  formatCoord,
  getCurrentPosition,
  haversineKm,
  isValidCoord,
  roadDistanceKm,
  type LatLng,
} from "@/lib/geo";
import { isOnline } from "@/lib/offline";
import type {
  Buyer,
  BuyerInsert,
  ExpenseInsert,
  FarmerListing,
  FarmerListingInsert,
  Profile,
} from "@/lib/types";
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

/** CornBulk Connect (guide §7): farmers, buyers, commute estimates, comparison. */
export default function Bulk() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: profile } = useProfile(user?.id);
  const { data: farmers = [], isLoading: loadingFarmers } = useFarmerListings();
  const { data: buyers = [], isLoading: loadingBuyers } = useBuyers();

  const insertFarmer = useInsertRow<FarmerListingInsert>("farmer_listings");
  const deleteFarmer = useDeleteRow("farmer_listings", "farmer_listings");
  const insertBuyer = useInsertRow<BuyerInsert>("buyers");
  const updateBuyer = useUpdateRow<Partial<Buyer> & { id: string }>("buyers");
  const deleteBuyer = useDeleteRow("buyers", "buyers");

  const [tab, setTab] = useState<"farmers" | "buyers">("farmers");
  const [viewFarmer, setViewFarmer] = useState<FarmerListing | null>(null);
  const [viewBuyer, setViewBuyer] = useState<Buyer | null>(null);
  const [commuteBuyer, setCommuteBuyer] = useState<Buyer | null>(null);
  const [farmerSheet, setFarmerSheet] = useState(false);
  const [buyerSheet, setBuyerSheet] = useState<{ open: boolean; editing: Buyer | null }>({
    open: false,
    editing: null,
  });
  // GPS coordinates attached to the buyer listing being created/edited.
  const [buyerCoords, setBuyerCoords] = useState<{ latitude: number | null; longitude: number | null }>({
    latitude: null,
    longitude: null,
  });
  const [locatingBuyer, setLocatingBuyer] = useState(false);

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
      latitude: isValidCoord(buyerCoords) ? buyerCoords.latitude : null,
      longitude: isValidCoord(buyerCoords) ? buyerCoords.longitude : null,
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

  /** Opens the buyer form with the editing row's coordinates preloaded. */
  const openBuyerSheet = (editing: Buyer | null) => {
    setBuyerCoords(
      editing
        ? { latitude: editing.latitude ?? null, longitude: editing.longitude ?? null }
        : { latitude: null, longitude: null }
    );
    setBuyerSheet({ open: true, editing });
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
            onClick={() => openBuyerSheet(null)}
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
                        <button className="row-edit" onClick={() => setCommuteBuyer(row)} data-testid={`button-commute-${row.id}`}>
                          <MapPin size={12} className="mr-0.5 inline" /> Commute
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
                setCommuteBuyer(viewBuyer);
                setViewBuyer(null);
              }}
            >
              <MapPin size={13} /> Commute &amp; distance
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

      {/* --------------------- Commute calculator (guide §7, step 3) --------------------- */}
      {commuteBuyer && (
        <CommuteSheet
          buyer={commuteBuyer}
          profile={profile ?? null}
          close={() => setCommuteBuyer(null)}
          onCompare={(transport) => {
            setCompareRows((current) =>
              current.some((row) => row.buyer.id === commuteBuyer.id)
                ? current.map((row) => (row.buyer.id === commuteBuyer.id ? { ...row, transport } : row))
                : [...current, { buyer: commuteBuyer, transport, deductions: 0 }]
            );
            setTab("buyers");
            setCommuteBuyer(null);
            toast({
              title: "Transport saved to comparison",
              description: `Estimated transport ${peso(transport)} for ${commuteBuyer.buyer_name}.`,
            });
          }}
        />
      )}

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

            {/* Optional GPS position — lets farmers compute commute distance to this buyer */}
            <div className="rounded-2xl border border-[#e6e9e2] p-3">
              <b className="text-[11.5px] text-[#3d5245]">Buyer GPS coordinates (optional)</b>
              <p className="mt-1 text-[10.5px] leading-relaxed text-[#75816f]">
                Helps farmers estimate the commute cost to this buyer. Only approximate coordinates
                are needed — never an exact address.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Field
                  label="Latitude"
                  name="buyer_lat"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  placeholder="e.g. 16.925500"
                  value={buyerCoords.latitude === null ? "" : String(buyerCoords.latitude)}
                  onChange={(value) => setBuyerCoords((c) => ({ ...c, latitude: value === "" ? null : Number(value) }))}
                />
                <Field
                  label="Longitude"
                  name="buyer_lng"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  placeholder="e.g. 121.754700"
                  value={buyerCoords.longitude === null ? "" : String(buyerCoords.longitude)}
                  onChange={(value) => setBuyerCoords((c) => ({ ...c, longitude: value === "" ? null : Number(value) }))}
                />
              </div>
              <button
                type="button"
                className="btn-outline mt-2 w-full"
                onClick={async () => {
                  setLocatingBuyer(true);
                  try {
                    setBuyerCoords(await getCurrentPosition());
                  } catch (error) {
                    toast({
                      title: "Could not get the location",
                      description: error instanceof Error ? error.message : "Please try again.",
                      variant: "error",
                    });
                  } finally {
                    setLocatingBuyer(false);
                  }
                }}
                disabled={locatingBuyer}
                data-testid="button-buyer-gps"
              >
                <Crosshair size={14} className={locatingBuyer ? "animate-spin" : ""} />
                {locatingBuyer ? "Finding location…" : "Use my current location"}
              </button>
              <p className="mt-1.5 text-center text-[10px] text-[#98a394]">
                {isValidCoord(buyerCoords) ? formatCoord(buyerCoords) : "No coordinates set"}
              </p>
            </div>

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

/* ------------------------------- Commute sheet ------------------------------- */

function CommuteSheet({
  buyer,
  profile,
  close,
  onCompare,
}: {
  buyer: Buyer;
  profile: Profile | null;
  close: () => void;
  onCompare: (transport: number) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const insertExpense = useInsertRow<ExpenseInsert>("expenses");

  // My location: farm coordinates from the profile (editable inline).
  const [myCoords, setMyCoords] = useState<{ latitude: number | null; longitude: number | null }>({
    latitude: profile?.farm_latitude ?? null,
    longitude: profile?.farm_longitude ?? null,
  });
  const [locating, setLocating] = useState(false);
  // Buyer location: coordinates stored with the listing (editable inline).
  const [buyerCoords, setBuyerCoords] = useState<{ latitude: number | null; longitude: number | null }>({
    latitude: buyer.latitude ?? null,
    longitude: buyer.longitude ?? null,
  });

  const [mode, setMode] = useState<"own" | "hired">("own");
  const [roadFactor, setRoadFactor] = useState("1.35");
  const [fuelUse, setFuelUse] = useState("0.12");
  const [fuelPrice, setFuelPrice] = useState("60");
  const [ratePerKm, setRatePerKm] = useState("15");
  const [deliveryFee, setDeliveryFee] = useState("");
  const [otherExpenses, setOtherExpenses] = useState("0");

  const haveBoth = isValidCoord(myCoords) && isValidCoord(buyerCoords);
  const oneWayKm = haveBoth ? roadDistanceKm(myCoords as LatLng, buyerCoords as LatLng, Number(roadFactor) || 1.35) : 0;
  const roundTrip = oneWayKm * 2;
  const straightKm = haveBoth ? haversineKm(myCoords as LatLng, buyerCoords as LatLng) : 0;

  const fuelCost = roundTrip * (Number(fuelUse) || 0) * (Number(fuelPrice) || 0);
  const flatFee = Number(deliveryFee) || 0;
  const hiredCost = flatFee > 0 ? flatFee : roundTrip * (Number(ratePerKm) || 0);
  const other = Number(otherExpenses) || 0;
  const total = mode === "own" ? fuelCost + other : hiredCost + other;

  const myLocationName = [profile?.municipality, profile?.province].filter(Boolean).join(", ") || "My farm";
  const locateMe = async () => {
    setLocating(true);
    try {
      setMyCoords(await getCurrentPosition());
    } catch (error) {
      toast({
        title: "Could not get your location",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
      });
    } finally {
      setLocating(false);
    }
  };

  /** Saves the estimate as a Transportation expense (offline-first). */
  const saveAsExpense = () => {
    if (!user) return;
    const notes =
      `Commute to ${buyer.buyer_name} \u00b7 ${myLocationName} \u2192 ${buyer.location || "buyer location"} \u00b7 ` +
      `${oneWayKm.toFixed(1)} km one-way (${roundTrip.toFixed(1)} km round trip)\u00b7 ${mode === "own" ? "own vehicle" : flatFee > 0 ? "hired delivery" : "hired per-km rate"}`;
    insertExpense.mutate(
      {
        user_id: user.id,
        category: "Transportation",
        amount: Math.round(total * 100) / 100,
        expense_date: todayInPhilippines(),
        notes,
      },
      {
        onSuccess: () => {
          toast({
            title: "Commute expense saved",
            description: isOnline()
              ? "Recorded under Transportation in Farm Records."
              : "Saved on this device \u2014 it will sync when you are back online.",
          });
          close();
        },
        onError: (error) =>
          toast({
            title: "Could not save the expense",
            description: error instanceof Error ? error.message : "Please try again.",
            variant: "error",
          }),
      }
    );
  };

  return (
    <Sheet title={`Commute to ${buyer.buyer_name}`} close={close}>
      <p className="text-[11.5px] leading-relaxed text-[#5c6b5e]">
        See both locations, the distance between them, and what the trip will likely cost \u2014 then
        count it as a farm expense with one tap.
      </p>

      {/* The two locations */}
      <div className="mt-3 route-map p-3">
        <div className="route-line">
          <span className="route-dot route-dot-a" />
          <span className="route-km" data-testid="text-commute-distance">
            {haveBoth ? `${oneWayKm.toFixed(1)} km` : "? km"}
          </span>
          <span className="route-dot route-dot-b" />
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div>
            <b className="block text-[11px] text-[#1c2b21]">My farm</b>
            <span className="block text-[10px] leading-snug text-[#75816f]">{myLocationName}</span>
            <span className="mt-0.5 block font-mono text-[9px] text-[#98a394]" data-testid="text-my-coords">
              {formatCoord(myCoords)}
            </span>
          </div>
          <div>
            <b className="block text-[11px] text-[#1c2b21]">{buyer.buyer_name}</b>
            <span className="block text-[10px] leading-snug text-[#75816f]">{buyer.location || "Buyer location"}</span>
            <span className="mt-0.5 block font-mono text-[9px] text-[#98a394]" data-testid="text-buyer-coords">
              {formatCoord(buyerCoords)}
            </span>
          </div>
        </div>
      </div>

      {/* Inline coordinate entry when something is missing */}
      {!isValidCoord(myCoords) && (
        <div className="mt-3 rounded-2xl border border-[#f0dfa8] bg-[#fffbea] p-3">
          <b className="text-[11px] text-[#8a6100]">Set your farm location</b>
          <p className="mt-1 text-[10.5px] leading-relaxed text-[#8a6100]">
            Capture your GPS position now, or save it permanently in Farm Profile.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field
              label="My latitude"
              name="my_lat"
              type="number"
              step="any"
              inputMode="decimal"
              placeholder="17.148200"
              value={myCoords.latitude === null ? "" : String(myCoords.latitude)}
              onChange={(value) => setMyCoords((c) => ({ ...c, latitude: value === "" ? null : Number(value) }))}
            />
            <Field
              label="My longitude"
              name="my_lng"
              type="number"
              step="any"
              inputMode="decimal"
              placeholder="121.976300"
              value={myCoords.longitude === null ? "" : String(myCoords.longitude)}
              onChange={(value) => setMyCoords((c) => ({ ...c, longitude: value === "" ? null : Number(value) }))}
            />
          </div>
          <button type="button" className="btn-outline mt-2 w-full" onClick={() => void locateMe()} disabled={locating} data-testid="button-commute-gps">
            <Crosshair size={14} className={locating ? "animate-spin" : ""} /> {locating ? "Finding your location\u2026" : "Use my current location"}
          </button>
        </div>
      )}
      {!isValidCoord(buyerCoords) && (
        <div className="mt-3 rounded-2xl border border-[#e6e9e2] p-3">
          <b className="text-[11px] text-[#3d5245]">Set the buyer\u2019s coordinates</b>
          <p className="mt-1 text-[10.5px] leading-relaxed text-[#75816f]">
            This listing has no GPS position yet \u2014 enter the buyer\u2019s approximate coordinates to
            compute the distance.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field
              label="Buyer latitude"
              name="buyer_lat"
              type="number"
              step="any"
              inputMode="decimal"
              placeholder="16.925500"
              value={buyerCoords.latitude === null ? "" : String(buyerCoords.latitude)}
              onChange={(value) => setBuyerCoords((c) => ({ ...c, latitude: value === "" ? null : Number(value) }))}
            />
            <Field
              label="Buyer longitude"
              name="buyer_lng"
              type="number"
              step="any"
              inputMode="decimal"
              placeholder="121.754700"
              value={buyerCoords.longitude === null ? "" : String(buyerCoords.longitude)}
              onChange={(value) => setBuyerCoords((c) => ({ ...c, longitude: value === "" ? null : Number(value) }))}
            />
          </div>
        </div>
      )}

      {/* Distance inputs */}
      {haveBoth && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field
            label="Road factor (\u00d7 straight line)"
            name="road_factor"
            type="number"
            step="0.05"
            min="1"
            inputMode="decimal"
            help={`Straight line: ${straightKm.toFixed(1)} km`}
            value={roadFactor}
            onChange={setRoadFactor}
          />
          <div className="flex items-end">
            <TinyStat label="Round trip" value={`${roundTrip.toFixed(1)} km`} />
          </div>
        </div>
      )}

      {/* Cost model */}
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
            <span className="field-label">Fuel use per km (liters)</span>
            <input className="field" type="number" min="0" step="0.01" inputMode="decimal" value={fuelUse} onChange={(event) => setFuelUse(event.target.value)} />
            <span className="field-help">Pickup \u2248 0.12 L/km \u00b7 cargo truck \u2248 0.20 L/km \u2014 adjust for your vehicle.</span>
          </label>
          <label className="block">
            <span className="field-label">Fuel price (\u20b1/liter)</span>
            <input className="field" type="number" min="0" step="0.01" inputMode="decimal" value={fuelPrice} onChange={(event) => setFuelPrice(event.target.value)} />
          </label>
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          <label className="block">
            <span className="field-label">Hired rate per km (\u20b1)</span>
            <input className="field" type="number" min="0" step="0.01" inputMode="decimal" value={ratePerKm} onChange={(event) => setRatePerKm(event.target.value)} />
            <span className="field-help">Tricycles and hired haulers commonly charge per km \u2014 adjust to your area\u2019s rate.</span>
          </label>
          <label className="block">
            <span className="field-label">Quoted flat delivery fee (\u20b1, if any)</span>
            <input className="field" type="number" min="0" step="0.01" inputMode="decimal" placeholder="e.g. 1500" value={deliveryFee} onChange={(event) => setDeliveryFee(event.target.value)} />
            <span className="field-help">Leave empty to use the per-km rate.</span>
          </label>
        </div>
      )}

      <label className="mt-4 block">
        <span className="field-label">Other transport expenses (\u20b1)</span>
        <input className="field" type="number" min="0" step="0.01" inputMode="decimal" placeholder="Loading, tolls, snacks\u2026" value={otherExpenses} onChange={(event) => setOtherExpenses(event.target.value)} />
      </label>

      <div className="mt-4 rounded-2xl bg-[#175a31] p-4 text-[#f2f8f4]">
        <div className="eyebrow" style={{ color: "#cfe4d6" }}>
          Estimated commute cost
        </div>
        <div className="mt-1 text-[26px] font-extrabold" data-testid="text-commute-total">
          {peso(total)}
        </div>
        <div className="mt-2 text-[10.5px] leading-relaxed text-[#cfe4d6]">
          {haveBoth
            ? mode === "own"
              ? `${roundTrip.toFixed(1)} km round trip \u00d7 ${Number(fuelUse) || 0} L/km \u00d7 ${peso(Number(fuelPrice) || 0, 2)}/L${other > 0 ? ` + ${peso(other)} other expenses` : ""}`
              : flatFee > 0
                ? `Delivery fee ${peso(flatFee)}${other > 0 ? ` + ${peso(other)} other expenses` : ""}`
                : `${roundTrip.toFixed(1)} km round trip \u00d7 ${peso(Number(ratePerKm) || 0, 2)}/km${other > 0 ? ` + ${peso(other)} other expenses` : ""}`
            : "Set both locations above to compute the cost."}
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-[#98a394]">
        This is an estimate, not a guaranteed amount. Road conditions, fuel prices, vehicle load and
        fees can change the actual cost.
      </p>

      <button
        className="btn-primary mt-4 w-full"
        onClick={saveAsExpense}
        disabled={insertExpense.isPending || !haveBoth || total <= 0}
        data-testid="button-save-commute-expense"
      >
        <Truck size={15} /> {insertExpense.isPending ? "Saving\u2026" : `Save as commute expense (${peso(total)})`}
      </button>
      <button
        className="btn-outline mt-2 w-full"
        onClick={() => onCompare(Math.round(total * 100) / 100)}
        disabled={!haveBoth}
        data-testid="button-transport-compare"
      >
        <Scale size={15} /> Use in buyer comparison
      </button>
    </Sheet>
  );
}
