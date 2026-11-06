import { Label, Pie, PieChart } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { formatBs } from "@/lib/format";
import { MoneyTooltip } from "./MoneyTooltip";

interface Props {
  items: { name: string; value: number }[];
  totalLabel: string;
  /** Texto cuando no hay datos. */
  empty?: string;
}

/** Torta con hueco: el total al centro y una leyenda con nombre, monto y porcentaje (nada solo con color). */
export default function DonutChart({ items, totalLabel, empty = "Todavía no hay datos." }: Props) {
  const total = items.reduce((a, b) => a + b.value, 0);
  // Todo en cero: sin esto, la leyenda mostraría «NaN%».
  if (items.length === 0 || total === 0) return <p className="empty-state">{empty}</p>;
  // Claves simples para las variables CSS; los nombres pueden llevar espacios o tildes.
  const config: ChartConfig = Object.fromEntries(
    items.map((item, i) => [`c${i}`, { label: item.name, color: `var(--color-branch-${(i % 6) + 1})` }]),
  );
  const data = items.map((item, i) => ({ key: `c${i}`, value: item.value, fill: `var(--color-c${i})` }));

  return (
    // Contenedor: el lado a lado depende del ancho de la card, no de la pantalla.
    <div className="@container">
    <div className="grid items-center gap-4 @md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
      {/* La leyenda de al lado ya dice todo con texto (nombre, porcentaje y monto): la torta es visual. */}
      <ChartContainer config={config} className="mx-auto aspect-square w-full max-w-48" aria-hidden="true">
        <PieChart accessibilityLayer={false}>
          <ChartTooltip cursor={false} content={<MoneyTooltip config={config} nameKey="key" hideLabel />} />
          <Pie data={data} dataKey="value" nameKey="key" rootTabIndex={-1} innerRadius="62%" strokeWidth={2} stroke="var(--color-surface)">
            <Label
              content={({ viewBox }) =>
                viewBox && "cx" in viewBox ? (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) - 8} className="fill-foreground text-base font-bold">
                      {formatBs(total)}
                    </tspan>
                    <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 12} className="fill-muted-foreground text-xs">
                      {totalLabel}
                    </tspan>
                  </text>
                ) : null
              }
            />
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="m-0 grid list-none gap-2 p-0 text-sm" aria-label={`${totalLabel}: ${formatBs(total)}`}>
        {items.map((item, i) => (
          <li key={item.name} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: `var(--color-branch-${(i % 6) + 1})` }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            <span className="text-muted-foreground tabular-nums">{Math.round((item.value / total) * 100)}%</span>
            <span className="w-24 text-right font-medium tabular-nums">{formatBs(item.value)}</span>
          </li>
        ))}
      </ul>
    </div>
    </div>
  );
}
