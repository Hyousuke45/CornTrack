import { useEffect, useMemo, useState } from "react";
import { Archive, Calculator, CheckCircle2, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import {
  useBudgetItems,
  useBudgets,
  useDeleteRow,
  useExpenses,
  useSaveBudgetWithItems,
  useUpdateBudgetWithItems,
  useUpdateRow,
} from "@/lib/data";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { formatDate, peso } from "@/lib/format";
import type { Budget } from "@/lib/types";
import { useToast } from "@/components/Toast";
import {
  Badge,
  Card,
  EmptyState,
  Field,
  SaveButton,
  SectionTitle,
  Sheet,
  StatCard,
  formNumber,
  formText,
} from "@/components/ui";

type BudgetFormState = {
  season_name: string;
  farm_area_ha: number;
  planned_planting_date: string;
  available_budget: number;
  expected_yield_kg: number;
  expected_price_per_kg: number;
  items: Array<{ category: string; planned_amount: number }>;
};

/** CornCost Planner (guide §5): budgets, planned vs actual, break-even price. */
export default function Planner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: budgets = [], isLoading: loading } = useBudgets(user?.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeList = useMemo(
    () => [...budgets].sort((a, b) => (a.status === b.status ? b.created_at.localeCompare(a.created_at) : a.status === "active" ? -1 : 1)),
    [budgets]
  );
  const selected = activeList.find((row) => row.id === selectedId) ?? activeList[0] ?? null;
  const { data: items = [] } = useBudgetItems(selected?.id);
  const { data: expenses = [] } = useExpenses(user?.id);

  const saveBudget = useSaveBudgetWithItems();
  const updateBudget = useUpdateBudgetWithItems();
  const patchBudget = useUpdateRow<Partial<Budget> & { id: string }>("budgets");
  const deleteBudget = useDeleteRow("budgets", `budgets:${user?.id ?? ""}`);

  const [sheet, setSheet] = useState<{ open: boolean; editing: Budget | null }>({
    open: false,
    editing: null,
  });

  // Keep selection valid when budgets load or change.
  useEffect(() => {
    if (!selected && activeList.length) setSelectedId(activeList[0].id);
  }, [activeList, selected]);

  const comparisons = useMemo(() => {
    if (!selected) return { rows: [], plannedTotal: 0, actualTotal: 0 };
    const startDate =
      (selected.planned_planting_date ?? selected.created_at).slice(0, 10) ?? "0000-00-00";
    const actuals = new Map<string, number>();
    for (const expense of expenses) {
      if ((expense.expense_date ?? "") >= startDate) {
        actuals.set(expense.category, (actuals.get(expense.category) ?? 0) + expense.amount);
      }
    }
    const categories = new Set<string>([
      ...items.map((item) => item.category),
      ...Array.from(actuals.keys()),
    ]);
    const rows = Array.from(categories)
      .sort((a, b) => a.localeCompare(b))
      .map((category) => {
        const planned = items.find((item) => item.category === category)?.planned_amount ?? 0;
        return { category, planned, actual: actuals.get(category) ?? 0 };
      });
    const plannedTotal = rows.reduce((sum, row) => sum + row.planned, 0);
    const actualTotal = rows.reduce((sum, row) => sum + row.actual, 0);
    return { rows, plannedTotal, actualTotal };
  }, [selected, items, expenses]);

  const breakEvenPlanned =
    selected && selected.expected_yield_kg > 0 ? comparisons.plannedTotal / selected.expected_yield_kg : null;
  const breakEvenActual =
    selected && selected.expected_yield_kg > 0 ? comparisons.actualTotal / selected.expected_yield_kg : null;

  const fail = (error: unknown) =>
    toast({
      title: "Could not save budget",
      description: error instanceof Error ? error.message : "Please try again.",
      variant: "error",
    });

  const submit = (form: FormData) => {
    if (!user) return;
    const state: BudgetFormState = {
      season_name: formText(form, "season_name") || "New planting season",
      farm_area_ha: formNumber(form, "farm_area_ha"),
      planned_planting_date: formText(form, "planned_planting_date"),
      available_budget: formNumber(form, "available_budget"),
      expected_yield_kg: formNumber(form, "expected_yield_kg"),
      expected_price_per_kg: formNumber(form, "expected_price_per_kg"),
      items: EXPENSE_CATEGORIES.map((category) => ({
        category,
        planned_amount: formNumber(form, `plan_${category}`),
      })),
    };
    const editing = sheet.editing;
    const action = editing
      ? updateBudget.mutateAsync({
          budgetId: editing.id,
          budget: {
            user_id: editing.user_id,
            season_name: state.season_name,
            farm_area_ha: state.farm_area_ha,
            planned_planting_date: state.planned_planting_date || null,
            available_budget: state.available_budget,
            expected_yield_kg: state.expected_yield_kg,
            expected_price_per_kg: state.expected_price_per_kg,
          },
          items: state.items,
        })
      : saveBudget.mutateAsync({
          budget: {
            user_id: user.id,
            season_name: state.season_name,
            farm_area_ha: state.farm_area_ha,
            planned_planting_date: state.planned_planting_date || null,
            available_budget: state.available_budget,
            expected_yield_kg: state.expected_yield_kg,
            expected_price_per_kg: state.expected_price_per_kg,
            status: "active",
          },
          items: state.items,
        });
    action
      .then((budget) => {
        toast({ title: editing ? "Budget updated" : "Budget created", description: state.season_name });
        setSheet({ open: false, editing: null });
        setSelectedId(budget.id);
      })
      .catch(fail);
  };

  const overBudget =
    selected && comparisons.plannedTotal > selected.available_budget
      ? comparisons.plannedTotal - selected.available_budget
      : 0;

  return (
    <div className="page-enter">
      <header className="mb-4">
        <a href="/" className="back-link">
          ← Back to Home
        </a>
        <h1 className="page-title">CornCost Planner</h1>
        <p className="page-intro">Plan your farming budget and compare it with actual spending.</p>
      </header>

      {/* Budget selector */}
      {activeList.length > 0 && (
        <div className="chip-row mb-3">
          {activeList.map((budget) => (
            <button
              key={budget.id}
              className={`chip ${selected?.id === budget.id ? "active" : ""}`}
              onClick={() => setSelectedId(budget.id)}
              data-testid={`chip-budget-${budget.id}`}
            >
              {budget.season_name}
              {budget.status === "archived" ? " (archived)" : ""}
            </button>
          ))}
        </div>
      )}

      <button
        className="btn-primary w-full"
        onClick={() => setSheet({ open: true, editing: null })}
        data-testid="button-new-budget"
      >
        <Plus size={16} /> Create New Budget
      </button>

      {loading ? (
        <Card className="mt-4">
          <div className="loading-block">Loading budgets…</div>
        </Card>
      ) : !selected ? (
        <Card className="mt-4">
          <EmptyState
            icon={<Calculator size={20} />}
            title="No budgets yet"
            text="Create a budget before planting: estimate your costs per category and the money you have available."
          />
        </Card>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatCard
              label="Available budget"
              value={peso(selected.available_budget)}
              meta={selected.season_name}
              accent="gold"
            />
            <StatCard
              label="Estimated expenses"
              value={peso(comparisons.plannedTotal)}
              meta="Sum of planned amounts"
              accent="red"
            />
            <StatCard
              label="Budget remaining"
              value={peso(selected.available_budget - comparisons.plannedTotal)}
              meta="Available − planned"
              accent={selected.available_budget - comparisons.plannedTotal >= 0 ? "green" : "red"}
            />
            <StatCard
              label="Actual spending"
              value={peso(comparisons.actualTotal)}
              meta="Recorded expenses since season start"
              accent="blue"
            />
          </div>

          {overBudget > 0 && (
            <div className="notice notice-warn mt-3" role="alert" data-testid="alert-over-budget">
              <TriangleAlert size={14} className="mr-1 inline" />
              Your estimated expenses are {peso(comparisons.plannedTotal)}, which is{" "}
              <b>{peso(overBudget)}</b> above your available budget.
            </div>
          )}

          {/* Break-even price (guide §5, step 5) */}
          <Card className="mt-3">
            <SectionTitle>Break-even price</SectionTitle>
            <p className="text-[11.5px] leading-relaxed text-[#5c6b5e]">
              The price per kilogram you need to recover your costs, assuming you sell your whole
              expected harvest of <b>{selected.expected_yield_kg.toLocaleString()} kg</b>.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="tiny-stat">
                <div className="tiny-label">Based on planned costs</div>
                <div className="tiny-value">
                  {breakEvenPlanned === null ? "—" : `${peso(breakEvenPlanned, 2)}/kg`}
                </div>
              </div>
              <div className="tiny-stat">
                <div className="tiny-label">Based on expenses so far</div>
                <div className="tiny-value">
                  {breakEvenActual === null ? "—" : `${peso(breakEvenActual, 2)}/kg`}
                </div>
              </div>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-[#98a394]">
              Break-even = total costs ÷ expected harvest. Actual results depend on harvest, drying
              deductions and buyer terms.
            </p>
          </Card>

          {/* Planned vs actual (guide §5, step 4) */}
          <Card className="mt-3">
            <SectionTitle>Planned vs Actual</SectionTitle>
            {comparisons.rows.length ? (
              <div className="table-wrap">
                <table className="table" data-testid="table-planned-actual">
                  <thead>
                    <tr>
                      <th>Expense</th>
                      <th>Planned</th>
                      <th>Actual</th>
                      <th>Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisons.rows.map((row) => {
                      const diff = row.planned - row.actual;
                      return (
                        <tr key={row.category}>
                          <td className="font-semibold text-[#1c2b21]">{row.category}</td>
                          <td>{peso(row.planned)}</td>
                          <td>{peso(row.actual)}</td>
                          <td>
                            {row.actual === 0 && row.planned === 0 ? (
                              <span className="faint">—</span>
                            ) : (
                              <span className={diff >= 0 ? "text-[#1e8e3e] font-semibold" : "text-[#d93025] font-semibold"}>
                                {diff >= 0 ? "under " : "over "}
                                {peso(Math.abs(diff))}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td className="font-bold">Total</td>
                      <td className="font-bold">{peso(comparisons.plannedTotal)}</td>
                      <td className="font-bold">{peso(comparisons.actualTotal)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={<Calculator size={20} />}
                title="Nothing planned yet"
                text="Add planned amounts when you create the budget, and your recorded expenses will appear here for comparison."
              />
            )}
            <p className="mt-3 text-[10px] text-[#98a394]">
              Actuals count expenses recorded from{" "}
              {formatDate(selected.planned_planting_date ?? selected.created_at)} onward.
            </p>
          </Card>

          {/* Budget actions */}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="btn-outline"
              onClick={() => setSheet({ open: true, editing: selected })}
              data-testid="button-edit-budget"
            >
              <Pencil size={13} /> Edit plan
            </button>
            <button
              className="btn-outline"
              onClick={() =>
                patchBudget.mutate(
                  { id: selected.id, user_id: selected.user_id, status: selected.status === "active" ? "archived" : "active" },
                  {
                    onSuccess: () =>
                      toast({
                        title: selected.status === "active" ? "Budget archived" : "Budget re-activated",
                      }),
                    onError: fail,
                  }
                )
              }
            >
              {selected.status === "active" ? (
                <>
                  <Archive size={13} /> Archive
                </>
              ) : (
                <>
                  <CheckCircle2 size={13} /> Set active
                </>
              )}
            </button>
            <button
              className="btn-outline"
              onClick={() => {
                if (!window.confirm(`Delete the budget “${selected.season_name}”?`)) return;
                deleteBudget.mutate(selected.id, {
                  onSuccess: () => toast({ title: "Budget deleted" }),
                  onError: fail,
                });
              }}
            >
              <Trash2 size={13} /> Delete
            </button>
            {selected.status === "archived" && <Badge>Archived</Badge>}
          </div>

          {/* Budget history */}
          {activeList.filter((row) => row.status === "archived").length > 0 && (
            <Card className="mt-3">
              <SectionTitle>Budget history</SectionTitle>
              {activeList
                .filter((row) => row.status === "archived")
                .map((row) => (
                  <button
                    key={row.id}
                    className="row-item w-full text-left"
                    onClick={() => setSelectedId(row.id)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="row-title">{row.season_name}</span>
                      <span className="row-sub block">
                        Created {formatDate(row.created_at)} · budget {peso(row.available_budget)}
                      </span>
                    </span>
                    <Badge>Archived</Badge>
                  </button>
                ))}
            </Card>
          )}
        </>
      )}

      {/* Create / edit budget sheet */}
      {sheet.open && (
        <Sheet
          title={sheet.editing ? "Edit Budget" : "Create New Budget"}
          close={() => setSheet({ open: false, editing: null })}
        >
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit(new FormData(event.currentTarget));
            }}
          >
            <Field
              label="Season / budget name"
              name="season_name"
              required
              placeholder="e.g. Wet season 2026"
              defaultValue={sheet.editing?.season_name ?? ""}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Farm area (hectares)"
                name="farm_area_ha"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                defaultValue={sheet.editing?.farm_area_ha ?? ""}
                placeholder="e.g. 2.5"
              />
              <Field
                label="Planned planting date"
                name="planned_planting_date"
                type="date"
                defaultValue={sheet.editing?.planned_planting_date ?? ""}
              />
              <Field
                label="Available budget (₱)"
                name="available_budget"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                required
                defaultValue={sheet.editing?.available_budget ?? ""}
                placeholder="e.g. 20000"
              />
              <Field
                label="Expected harvest (kg)"
                name="expected_yield_kg"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                defaultValue={sheet.editing?.expected_yield_kg ?? ""}
                placeholder="e.g. 6500"
              />
            </div>
            <Field
              label="Expected selling price (₱/kg)"
              name="expected_price_per_kg"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              defaultValue={sheet.editing?.expected_price_per_kg ?? ""}
              placeholder="e.g. 18.00"
            />

            <div className="divider" />
            <p className="eyebrow">Planned expenses per category (₱)</p>
            {EXPENSE_CATEGORIES.map((category) => (
              <Field
                key={category}
                label={category}
                name={`plan_${category}`}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                defaultValue={
                  sheet.editing
                    ? items.find((item) => item.category === category)?.planned_amount ?? 0
                    : 0
                }
              />
            ))}
            <div className="notice">Planned amounts can be edited anytime with “Edit plan”.</div>
            <SaveButton
              label="Calculate & Save Budget"
              pending={saveBudget.isPending || updateBudget.isPending}
              testId="button-save-budget"
            />
          </form>
        </Sheet>
      )}
    </div>
  );
}
