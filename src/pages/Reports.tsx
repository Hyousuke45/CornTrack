import { useMemo } from "react";
import { BarChart3, Download, PieChart as PieIcon } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/auth/AuthContext";
import { useExpenses, useIncomes } from "@/lib/data";
import { CATEGORY_STYLE } from "@/lib/constants";
import { monthKey, monthLabel, peso, pesoCompact } from "@/lib/format";
import { useToast } from "@/components/Toast";
import { Card, EmptyState, SectionTitle, StatCard } from "@/components/ui";

const MONTHS_BACK = 6;

/** Reports (guide §8): profit/loss summaries computed from saved records. */
export default function Reports() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: expenses = [], isLoading: loadingExpenses } = useExpenses(user?.id);
  const { data: incomes = [], isLoading: loadingIncomes } = useIncomes(user?.id);

  const totals = useMemo(() => {
    const expenseTotal = expenses.reduce((sum, row) => sum + row.amount, 0);
    const incomeTotal = incomes.reduce((sum, row) => sum + row.total_amount, 0);
    const cornKg = incomes.reduce((sum, row) => sum + row.quantity_kg, 0);
    return { expenseTotal, incomeTotal, cornKg, net: incomeTotal - expenseTotal };
  }, [expenses, incomes]);

  const monthly = useMemo(() => {
    const map = new Map<string, { income: number; expenses: number }>();
    const keys: string[] = [];
    const now = new Date();
    for (let index = MONTHS_BACK - 1; index >= 0; index -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      keys.push(key);
      map.set(key, { income: 0, expenses: 0 });
    }
    for (const row of incomes) {
      const bucket = map.get(monthKey(row.selling_date));
      if (bucket) bucket.income += row.total_amount;
    }
    for (const row of expenses) {
      const bucket = map.get(monthKey(row.expense_date));
      if (bucket) bucket.expenses += row.amount;
    }
    return keys.map((key) => ({ month: monthLabel(key), income: map.get(key)?.income ?? 0, expenses: map.get(key)?.expenses ?? 0 }));
  }, [expenses, incomes]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of expenses) map.set(row.category, (map.get(row.category) ?? 0) + row.amount);
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value, color: CATEGORY_STYLE[name]?.bg ?? "#cbd5c0" }))
      .sort((a, b) => b.value - a.value);
  }, [expenses]);

  const downloadCsv = () => {
    const rows: Array<Array<string | number>> = [
      ["Date", "Type", "Category", "Details", "Amount PHP"],
      ...expenses.map((row) => [
        row.expense_date,
        "Expense",
        row.category,
        row.notes,
        row.amount,
      ]),
      ...incomes.map((row) => [
        row.selling_date,
        "Income",
        row.buyer_name ? `Corn sold · ${row.buyer_name}` : "Corn sold",
        `${row.quantity_kg} kg @ ${row.price_per_kg}/kg, deductions ${row.deductions}`,
        row.total_amount,
      ]),
      ["TOTAL", "", "", `Net: ${totals.net >= 0 ? "profit" : "loss"}`, totals.net],
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "corntrack-records.csv";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast({ title: "CSV download started", description: "Your records and totals are being downloaded." });
  };

  const loading = loadingExpenses || loadingIncomes;
  const hasData = expenses.length + incomes.length > 0;

  return (
    <div className="page-enter">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-intro">Profit and loss, calculated from your saved records.</p>
        </div>
        <button className="btn-outline flex-none" onClick={downloadCsv} data-testid="button-download-csv">
          <Download size={14} /> CSV
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Expenses" value={loading ? "…" : peso(totals.expenseTotal)} accent="red" />
        <StatCard label="Total Income" value={loading ? "…" : peso(totals.incomeTotal)} accent="green" />
        <StatCard
          label={totals.net >= 0 ? "Net Profit" : "Net Loss"}
          value={loading ? "…" : peso(Math.abs(totals.net))}
          accent={totals.net >= 0 ? "blue" : "red"}
          meta="Income minus recorded expenses"
        />
        <StatCard label="Corn Sold" value={loading ? "…" : `${totals.cornKg.toLocaleString()} kg`} accent="gold" />
      </div>

      {/* Monthly trend */}
      <Card className="mt-4">
        <SectionTitle>Income &amp; expenses by month</SectionTitle>
        {hasData ? (
          <>
            <div className="h-[220px]" data-testid="chart-reports-monthly">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ top: 6, right: 6, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke="#eef0ea" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#98a394" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#98a394" }} axisLine={false} tickLine={false} tickFormatter={pesoCompact} />
                  <ChartTooltip
                    formatter={(value) => peso(Number(value ?? 0))}
                    contentStyle={{ borderRadius: 10, border: "1px solid #e6e9e2", fontSize: 11 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="income" name="Income" fill="#1e8e3e" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#e04f2f" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Income</th>
                    <th>Expenses</th>
                    <th>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.map((row) => (
                    <tr key={row.month}>
                      <td className="font-semibold">{row.month}</td>
                      <td>{peso(row.income)}</td>
                      <td>{peso(row.expenses)}</td>
                      <td className={row.income - row.expenses >= 0 ? "font-semibold text-[#1e8e3e]" : "font-semibold text-[#d93025]"}>
                        {peso(row.income - row.expenses)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyState icon={<BarChart3 size={20} />} title="No records to report" text="Add expenses and income in Farm Records — your report builds itself from there." />
        )}
      </Card>

      {/* Expense breakdown */}
      <Card className="mt-4">
        <SectionTitle>Where expenses go</SectionTitle>
        {totals.expenseTotal > 0 ? (
          <div className="grid grid-cols-[130px_1fr] items-center gap-3">
            <div className="h-[130px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={36} outerRadius={58} paddingAngle={3} stroke="none">
                    {byCategory.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip formatter={(value) => peso(Number(value ?? 0))} contentStyle={{ borderRadius: 10, border: "1px solid #e6e9e2", fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              {byCategory.map((entry) => (
                <div key={entry.name} className="data-row text-[11px]">
                  <span className="flex items-center gap-2 text-[#5c6b5e]">
                    <i className="inline-block h-2 w-2 rounded-sm" style={{ background: entry.color }} />
                    {entry.name}
                  </span>
                  <b className="text-[#1c2b21]">
                    {peso(entry.value)}
                    <span className="ml-1 font-normal text-[#98a394]">
                      {Math.round((entry.value / totals.expenseTotal) * 100)}%
                    </span>
                  </b>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState icon={<PieIcon size={20} />} title="No expenses to break down" text="Record farming costs in Farm Records to see the split by category." />
        )}
      </Card>

      <div className="notice mt-4">
        Reports reflect only the records saved in your CornTrack account. They support record-keeping
        and planning — they are not accounting or tax advice.
      </div>
    </div>
  );
}
