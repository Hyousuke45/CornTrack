import { useMemo } from "react";
import { Link } from "wouter";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calculator,
  Handshake,
  ReceiptText,
  Sprout,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useBuyers, useExpenses, useIncomes, usePrices, useProfile } from "@/lib/data";
import { formatDateShort, kg, peso } from "@/lib/format";
import { categoryStyle } from "@/lib/constants";
import { Card, EmptyState, QueryErrorNotice, SectionTitle, StatCard } from "@/components/ui";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Dashboard (guide §3): summary + the four main features. */
export default function Home() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
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
  const { data: prices = [] } = usePrices();
  const { data: buyers = [] } = useBuyers();

  const totals = useMemo(() => {
    const expenseTotal = expenses.reduce((sum, row) => sum + row.amount, 0);
    const incomeTotal = incomes.reduce((sum, row) => sum + row.total_amount, 0);
    const cornKg = incomes.reduce((sum, row) => sum + row.quantity_kg, 0);
    return { expenseTotal, incomeTotal, cornKg, profit: incomeTotal - expenseTotal };
  }, [expenses, incomes]);

  const recent = useMemo(() => {
    const rows = [
      ...expenses.map((row) => ({
        id: row.id,
        kind: "expense" as const,
        title: row.category,
        date: row.expense_date,
        amount: row.amount,
        notes: row.notes,
      })),
      ...incomes.map((row) => ({
        id: row.id,
        kind: "income" as const,
        title: row.buyer_name ? `Corn sold · ${row.buyer_name}` : "Corn sold",
        date: row.selling_date,
        amount: row.total_amount,
        notes: `${row.quantity_kg.toLocaleString()} kg @ ${peso(row.price_per_kg, 2)}/kg`,
      })),
    ];
    return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  }, [expenses, incomes]);

  const firstName = (profile?.full_name ?? "Farmer").split(" ")[0];
  const hasRecords = expenses.length + incomes.length > 0;

  return (
    <div className="page-enter">
      <header className="mb-4">
        <h1 className="page-title">
          {greeting()}, {firstName}!
        </h1>
        <p className="page-intro">Manage your corn farm finances.</p>
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

      {/* Estimated Profit / Loss — updates as records are added (guide §3) */}
      <div className="profit-hero">
        <div className="eyebrow" style={{ color: "#cfe4d6" }}>
          Estimated Profit / Loss
        </div>
        <div className="profit-value" data-testid="text-home-profit">
          {totals.profit >= 0 ? peso(totals.profit) : `−${peso(Math.abs(totals.profit))}`}
        </div>
        <div className="profit-meta">
          {hasRecords
            ? "Income minus recorded expenses — updates when you add farm records."
            : "₱0.00 — your summary updates when you add farm records."}
        </div>
        <div className="profit-split">
          <span>
            <ArrowUpRight size={13} /> {peso(totals.incomeTotal)} income
          </span>
          <span>
            <ArrowDownLeft size={13} /> {peso(totals.expenseTotal)} expenses
          </span>
        </div>
      </div>

      {/* Four main features (guide §3) */}
      <div className="tile-grid mt-4">
        <Link href="/records" className="tile tile-green" data-testid="tile-farm-records">
          <span className="tile-icon">
            <Wallet size={17} />
          </span>
          <span className="tile-title">Farm Expenses &amp; Profit</span>
          <span className="tile-sub">Record costs and income.</span>
        </Link>
        <Link href="/planner" className="tile tile-orange" data-testid="tile-planner">
          <span className="tile-icon">
            <Calculator size={17} />
          </span>
          <span className="tile-title">CornCost Planner</span>
          <span className="tile-sub">Plan your farming budget.</span>
        </Link>
        <Link href="/prices" className="tile tile-blue" data-testid="tile-prices">
          <span className="tile-icon">
            <TrendingUp size={17} />
          </span>
          <span className="tile-title">CornPrice Watch</span>
          <span className="tile-sub">
            {prices.length > 0 ? `${prices.length} price reports shared` : "Monitor supply prices."}
          </span>
        </Link>
        <Link href="/bulk" className="tile tile-purple" data-testid="tile-bulk">
          <span className="tile-icon">
            <Handshake size={17} />
          </span>
          <span className="tile-title">CornBulk Connect</span>
          <span className="tile-sub">
            {buyers.length > 0 ? `${buyers.length} buyer listings` : "Find farmers and buyers."}
          </span>
        </Link>
      </div>

      {/* Quick figures */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatCard label="Total Expenses" value={loadingExpenses ? "…" : peso(totals.expenseTotal)} accent="red" />
        <StatCard label="Harvest Income" value={loadingIncomes ? "…" : peso(totals.incomeTotal)} accent="green" />
        <StatCard label="Corn Sold" value={loadingIncomes ? "…" : kg(totals.cornKg)} accent="blue" />
        <StatCard
          label="Active Budget"
          value="View planner"
          meta="Planned vs actual spending"
          accent="gold"
        />
      </div>

      {/* Recent activity */}
      <Card className="mt-4">
        <SectionTitle
          action={
            <Link href="/records" className="text-[11.5px] font-bold text-[#1e6b3c] no-underline">
              View all
            </Link>
          }
        >
          Recent activity
        </SectionTitle>
        {recent.length ? (
          <div>
            {recent.map((row) => {
              const style = categoryStyle(row.kind === "expense" ? row.title : "Farmgate corn price");
              return (
                <div key={`${row.kind}-${row.id}`} className="row-item">
                  <span
                    className="row-icon"
                    style={{ background: style.bg, color: style.fg }}
                  >
                    {row.kind === "expense" ? <ArrowUpRight size={17} /> : <ArrowDownLeft size={17} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="row-title">{row.title}</span>
                    <span className="row-sub block">
                      {formatDateShort(row.date)}
                      {row.notes ? ` · ${row.notes}` : ""}
                    </span>
                  </span>
                  <b className={`row-amount ${row.kind === "expense" ? "amount-expense" : "amount-income"}`}>
                    {row.kind === "expense" ? "−" : "+"}
                    {peso(row.amount)}
                  </b>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Sprout size={20} />}
            title="No farm records yet"
            text="Open Farm Expenses & Profit to add your first expense or income entry."
          />
        )}
      </Card>

      <p className="mt-4 text-center text-[10px] leading-relaxed text-[#98a394]">
        <ReceiptText size={11} className="mr-1 inline" />
        CornTrack keeps organized records and useful estimates — it does not guarantee lower costs
        or higher profits.
      </p>
    </div>
  );
}
