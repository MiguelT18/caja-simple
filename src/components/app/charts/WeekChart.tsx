import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { ChartTable, axisBs } from "./ChartTable";
import { MoneyTooltip } from "./MoneyTooltip";

const config = {
  sales: { label: "Ventas", color: "var(--color-income)" },
  expenses: { label: "Gastos", color: "var(--color-expense)" },
} satisfies ChartConfig;

const dayLabel = new Intl.DateTimeFormat("es-BO", { weekday: "short", day: "numeric", timeZone: "UTC" });

interface Props {
  days: { date: string; sales: number; expenses: number; label?: string }[];
  /** Por defecto, los últimos 7 días. */
  caption?: string;
  empty?: string;
}

/** Barras de ventas y gastos por día. */
export default function WeekChart({ days, caption = "Ventas y gastos de los últimos 7 días", empty = "Sin ventas ni gastos en los últimos 7 días." }: Props) {
  if (days.every((d) => d.sales === 0 && d.expenses === 0)) return <p className="empty-state">{empty}</p>;
  const data = days.map((d) => ({ ...d, label: d.label ?? dayLabel.format(new Date(`${d.date}T12:00:00Z`)) }));
  return (
    <>
    <ChartTable caption={caption} columns={["Ventas", "Gastos"]} rows={data.map((d) => ({ label: d.label, values: [d.sales, d.expenses] }))} />
    <ChartContainer config={config} className="aspect-auto h-64 w-full" aria-hidden="true">
      <BarChart accessibilityLayer={false} data={data} margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={axisBs} />
        <ChartTooltip cursor={false} content={<MoneyTooltip config={config} />} />
        <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
        <Bar dataKey="sales" fill="var(--color-sales)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
    </>
  );
}
