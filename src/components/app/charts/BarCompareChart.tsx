import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { ChartTable, axisBs } from "./ChartTable";
import { MoneyTooltip } from "./MoneyTooltip";

const config = {
  sales: { label: "Ventas", color: "var(--color-income)" },
  expenses: { label: "Gastos", color: "var(--color-expense)" },
} satisfies ChartConfig;

interface Props {
  rows: { label: string; sales: number; expenses: number }[];
}

/** Barras horizontales de ventas y gastos por fila (turnos o sucursales). */
export default function BarCompareChart({ rows }: Props) {
  if (rows.every((r) => r.sales === 0 && r.expenses === 0)) return <p className="empty-state">Sin ventas ni gastos hoy.</p>;
  return (
    <>
    <ChartTable caption="Ventas y gastos de hoy" columns={["Ventas", "Gastos"]} rows={rows.map((r) => ({ label: r.label, values: [r.sales, r.expenses] }))} />
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: `${rows.length * 3.5 + 3}rem` }} aria-hidden="true">
      <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 8 }}>
        <CartesianGrid horizontal={false} />
        <YAxis dataKey="label" type="category" tickLine={false} axisLine={false} width={96} />
        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={axisBs} />
        <ChartTooltip cursor={false} content={<MoneyTooltip config={config} />} />
        <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
        <Bar dataKey="sales" fill="var(--color-sales)" radius={4} barSize={14} />
        <Bar dataKey="expenses" fill="var(--color-expenses)" radius={4} barSize={14} />
      </BarChart>
    </ChartContainer>
    </>
  );
}
