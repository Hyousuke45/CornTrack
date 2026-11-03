import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  Bug,
  CloudUpload,
  Coins,
  Fuel,
  HardHat,
  Leaf,
  Package,
  Plus,
  Sprout,
  Tractor,
  Truck,
  Wheat,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import {
  useDeleteRow,
  useExpenses,
  useIncomes,
  useInsertRow,
  useUpdateRow,
} from "@/lib/data";
import { EXPENSE_CATEGORIES, categoryStyle } from "@/lib/constants";
import { formatDate, peso, todayInPhilippines } from "@/lib/format";
import { isOnline, usePendingIds } from "@/lib/offline";
import type { Expense, ExpenseInsert, Income, IncomeInsert } from "@/lib/types";
import { useToast } from "@/components/Toast";
import {
  Card,
  EmptyState,
  Field,
  QueryErrorNotice,
  SaveButton,
  SectionTitle,
  SelectField,
  Sheet,
  StatCard,
  TextArea,
  formNumber,
  formText,
} from "@/components/ui";

const CATEGORY_ICONS: Record<string, typeof Sprout> = {
  Seeds: Sprout,
  Fertilizer: Leaf,
  Pesticides: Bug,
  "Land preparation": Tractor,
  Labor: HardHat,
  "Irrigation or fuel": Fuel,
  Harvesting: Wheat,
  Transportation: Truck,
  "Other farming expenses": Package,
};

function categoryIcon(category: string) {
  return CATEGORY_ICONS[category] ?? Package;
}

/** Farm Records (guide §4): expense + income entries with live totals. */
export default function Records() {
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    data: expenses = [],
    isLoading: loadingExpenses,
    isError: expensesFailed,
    error: expensesError,
    refetch: refetchExpenses,
  } = useExpenses(user?.id);
  const {
    data: incomes = [],
    isLoading: loadingIncomes,
    isError: incomesFailed,
    error: incomesError,
    refetch: refetchIncomes,
  } = useIncomes(user?.id);

  const insertExpense = useInsertRow<ExpenseInsert>("expenses");
  const updateExpense = useUpdateRow<Partial<Expense> & { id: string }>("expenses");
  const deleteExpense = useDeleteRow("expenses", `expenses:${user?.id ?? ""}`);
  const insertIncome = useInsertRow<IncomeInsert>("incomes");
  const updateIncome = useUpdateRow<Partial<Income> & { id: string }>("incomes");
  const deleteIncome = useDeleteRow("incomes", `incomes:${user?.id ?? ""}`);

  const [tab, setTab] = useState<"expenses" | "income">("expenses");
  const pendingExpenseIds = usePendingIds("expenses");
  const pendingIncomeIds = usePendingIds("incomes");
  const [expenseSheet, setExpenseSheet] = useState<{ open: boolean; editing: Expense | null }>({
    open: false,
    editing: null,
  });
  const [incomeSheet, setIncomeSheet] = useState<{ open: boolean; editing: Income | null }>({
    open: false,
    editing: null,
  });

  const totals = useMemo(() => {
    const expenseTotal = expenses.reduce((sum, row) => sum + row.amount, 0);
    const incomeTotal = incomes.reduce((sum, row) => sum + row.total_amount, 0);
    return { expenseTotal, incomeTotal, profit: incomeTotal - expenseTotal };
  }, [expenses, incomes]);

  const fail = (error: unknown) =>
    toast({
      title: "Could not save",
      description: error instanceof Error ? error.message : "Please check your connection and try again.",
      variant: "error",
    });

  const saveExpense = (form: FormData) => {
    if (!user) return;
    const row = {
      user_id: user.id,
      category: formText(form, "category"),
      amount: formNumber(form, "amount"),
      expense_date: formText(form, "expense_date") || todayInPhilippines(),
      notes: formText(form, "notes"),
    };
    const editing = expenseSheet.editing;
    const action = editing
      ? updateExpense.mutateAsync({ ...row, id: editing.id })
      : insertExpense.mutateAsync(row);
    action
      .then(() => {
        toast({
          title: editing ? "Expense updated" : "Expense saved",
          description: isOnline()
            ? "Your totals were recalculated."
            : "Saved on this device — it will sync when you are back online.",
        });
        setExpenseSheet({ open: false, editing: null });
      })
      .catch(fail);
  };

  const saveIncome = (form: FormData) => {
    if (!user) return;
    const quantity = formNumber(form, "quantity_kg");
    const price = formNumber(form, "price_per_kg");
    const deductions = formNumber(form, "deductions");
    const row = {
      user_id: user.id,
      selling_date: formText(form, "selling_date") || todayInPhilippines(),
      quantity_kg: quantity,
      price_per_kg: price,
      deductions,
      total_amount: Math.max(quantity * price - deductions, 0),
      buyer_name: formText(form, "buyer_name"),
      notes: formText(form, "notes"),
    };
    const editing = incomeSheet.editing;
    const action = editing
      ? updateIncome.mutateAsync({ ...row, id: editing.id })
      : insertIncome.mutateAsync(row);
    action
      .then(() => {
        toast({
          title: editing ? "Income updated" : "Income saved",
          description: isOnline()
            ? "Your totals were recalculated."
            : "Saved on this device — it will sync when you are back online.",
        });
        setIncomeSheet({ open: false, editing: null });
      })
      .catch(fail);
  };

  const removeRow = (kind: "expense" | "income", id: string, label: string) => {
    if (!window.confirm(`Delete this ${label}? This updates your totals.`)) return;
    const mutation = kind === "expense" ? deleteExpense : deleteIncome;
    mutation.mutate(id, {
      onSuccess: () => toast({ title: "Record deleted", description: "Your totals were updated." }),
      onError: fail,
    });
  };

  const loading = loadingExpenses || loadingIncomes;

  return (
    <div className="page-enter">
      <header className="mb-4">
        <h1 className="page-title">Farm Records</h1>
        <p className="page-intro">Record costs and income — totals update automatically.</p>
      </header>

      {(expensesFailed || incomesFailed) && (
        <QueryErrorNotice
          error={expensesFailed ? expensesError : incomesError}
          onRetry={() => {
            refetchExpenses();
            refetchIncomes();
          }}
        />
      )}

      <div className="grid grid-cols-3 gap-2.5">
        <StatCard label="Total Expenses" value={loading ? "…" : peso(totals.expenseTotal)} accent="red" />
        <StatCard label="Harvest Income" value={loading ? "…" : peso(totals.incomeTotal)} accent="green" />
        <StatCard label="Est. Profit" value={loading ? "…" : peso(totals.profit)} accent="blue" />
      </div>
      <p className="mt-1.5 text-center text-[10px] text-[#98a394]">Income minus recorded expenses</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          className="btn-primary"
          onClick={() => setExpenseSheet({ open: true, editing: null })}
          data-testid="button-add-expense"
        >
          <Plus size={16} /> Add Expense
        </button>
        <button
          className="btn-primary btn-gold"
          onClick={() => setIncomeSheet({ open: true, editing: null })}
          data-testid="button-add-income"
        >
          <Plus size={16} /> Add Income
        </button>
      </div>

      <div className="mt-4">
        <div className="segmented">
          <button
            className={`segment ${tab === "expenses" ? "active" : ""}`}
            onClick={() => setTab("expenses")}
            data-testid="tab-expenses"
          >
            Expenses ({expenses.length})
          </button>
          <button
            className={`segment ${tab === "income" ? "active" : ""}`}
            onClick={() => setTab("income")}
            data-testid="tab-income"
          >
            Income ({incomes.length})
          </button>
        </div>
      </div>

      <Card className="mt-3">
        <SectionTitle>{tab === "expenses" ? "Recent Expenses" : "Harvest Income"}</SectionTitle>

        {loading ? (
          <div className="loading-block">Loading records…</div>
        ) : tab === "expenses" ? (
          expenses.length ? (
            <div>
              {expenses.map((row) => {
                const Icon = categoryIcon(row.category);
                const style = categoryStyle(row.category);
                return (
                  <div key={row.id} className="row-item" data-testid={`row-expense-${row.id}`}>
                    <span className="row-icon" style={{ background: style.bg, color: style.fg }}>
                      <Icon size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="row-title">
                        {row.category}
                        {pendingExpenseIds.has(row.id) && (
                          <span className="pending-badge ml-1.5" data-testid={`badge-pending-expense-${row.id}`}>
                            <CloudUpload size={9} /> waiting to sync
                          </span>
                        )}
                      </span>
                      <span className="row-sub block">
                        {formatDate(row.expense_date)}
                        {row.notes ? ` · ${row.notes}` : ""}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <b className="row-amount amount-expense">−{peso(row.amount)}</b>
                      <span className="flex">
                        <button
                          className="row-edit"
                          aria-label={`Edit ${row.category}`}
                          onClick={() => setExpenseSheet({ open: true, editing: row })}
                          data-testid={`button-edit-expense-${row.id}`}
                        >
                          Edit
                        </button>
                        <button
                          className="row-edit row-edit-danger"
                          aria-label={`Delete ${row.category}`}
                          onClick={() => removeRow("expense", row.id, "expense")}
                          data-testid={`button-delete-expense-${row.id}`}
                        >
                          Delete
                        </button>
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<Sprout size={20} />}
              title="No expenses yet"
              text="Tap Add Expense to record fertilizer, seeds, labor and other farming costs."
            />
          )
        ) : incomes.length ? (
          <div>
            {incomes.map((row) => (
              <div key={row.id} className="row-item" data-testid={`row-income-${row.id}`}>
                <span className="row-icon" style={{ background: "#e1f3e6", color: "#1c7c3c" }}>
                  <ArrowDownLeft size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="row-title">
                    {row.buyer_name ? `Corn sold · ${row.buyer_name}` : "Corn sold"}
                    {pendingIncomeIds.has(row.id) && (
                      <span className="pending-badge ml-1.5" data-testid={`badge-pending-income-${row.id}`}>
                        <CloudUpload size={9} /> waiting to sync
                      </span>
                    )}
                  </span>
                  <span className="row-sub block">
                    {formatDate(row.selling_date)} · {row.quantity_kg.toLocaleString()} kg @{" "}
                    {peso(row.price_per_kg, 2)}/kg
                    {row.deductions > 0 ? ` · less ${peso(row.deductions)} deductions` : ""}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <b className="row-amount amount-income">+{peso(row.total_amount)}</b>
                  <span className="flex">
                    <button
                      className="row-edit"
                      aria-label="Edit income"
                      onClick={() => setIncomeSheet({ open: true, editing: row })}
                      data-testid={`button-edit-income-${row.id}`}
                    >
                      Edit
                    </button>
                    <button
                      className="row-edit row-edit-danger"
                      aria-label="Delete income"
                      onClick={() => removeRow("income", row.id, "income entry")}
                      data-testid={`button-delete-income-${row.id}`}
                    >
                      Delete
                    </button>
                  </span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Coins size={20} />}
            title="No income yet"
            text="After harvest, tap Add Income to record the quantity sold and the price per kilogram."
          />
        )}
      </Card>

      <div className="notice mt-4">
        <b>Tip:</b> record expenses as they happen — CornPrice Watch and the CornCost Planner work
        best when your records are complete.
      </div>

      {/* ------------------------------ Add/Edit Expense ------------------------------ */}
      {expenseSheet.open && (
        <Sheet
          title={expenseSheet.editing ? "Edit Expense" : "Add Farm Expense"}
          close={() => setExpenseSheet({ open: false, editing: null })}
        >
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveExpense(new FormData(event.currentTarget));
            }}
          >
            <SelectField
              label="Expense category"
              name="category"
              defaultValue={expenseSheet.editing?.category ?? "Fertilizer"}
              options={EXPENSE_CATEGORIES}
            />
            <Field
              label="Amount paid (₱)"
              name="amount"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              required
              defaultValue={expenseSheet.editing?.amount ?? ""}
              placeholder="0.00"
            />
            <Field
              label="Date of expense"
              name="expense_date"
              type="date"
              required
              defaultValue={expenseSheet.editing?.expense_date ?? todayInPhilippines()}
            />
            <TextArea
              label="Notes (optional)"
              name="notes"
              placeholder="Product, quantity, or other details"
              defaultValue={expenseSheet.editing?.notes ?? ""}
            />
            <SaveButton
              label="Save Expense"
              pending={insertExpense.isPending || updateExpense.isPending}
              testId="button-save-expense"
            />
          </form>
        </Sheet>
      )}

      {/* ------------------------------ Add/Edit Income ------------------------------ */}
      {incomeSheet.open && (
        <Sheet
          title={incomeSheet.editing ? "Edit Income" : "Add Harvest Income"}
          close={() => setIncomeSheet({ open: false, editing: null })}
        >
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveIncome(new FormData(event.currentTarget));
            }}
          >
            <Field
              label="Selling date"
              name="selling_date"
              type="date"
              required
              defaultValue={incomeSheet.editing?.selling_date ?? todayInPhilippines()}
            />
            <Field
              label="Quantity of corn sold (kg)"
              name="quantity_kg"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              required
              defaultValue={incomeSheet.editing?.quantity_kg ?? ""}
              placeholder="e.g. 2000"
            />
            <Field
              label="Selling price per kilogram (₱)"
              name="price_per_kg"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              required
              defaultValue={incomeSheet.editing?.price_per_kg ?? ""}
              placeholder="e.g. 18.00"
            />
            <Field
              label="Applicable deductions (₱, if known)"
              name="deductions"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              defaultValue={incomeSheet.editing?.deductions ?? 0}
              placeholder="Drying, hauling, weighing fees…"
              help="Total recorded = quantity × price − deductions."
            />
            <Field
              label="Buyer (optional)"
              name="buyer_name"
              defaultValue={incomeSheet.editing?.buyer_name ?? ""}
              placeholder="Who did you sell to?"
            />
            <TextArea
              label="Notes (optional)"
              name="notes"
              placeholder="Moisture, grade, payment terms…"
              defaultValue={incomeSheet.editing?.notes ?? ""}
            />
            <SaveButton
              label="Save Income"
              pending={insertIncome.isPending || updateIncome.isPending}
              testId="button-save-income"
            />
          </form>
        </Sheet>
      )}
    </div>
  );
}
