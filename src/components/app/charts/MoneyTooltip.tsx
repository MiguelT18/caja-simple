import { ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatBs } from "@/lib/format";

// Contenido del tooltip con los montos como «Bs 1.240,00».
export function MoneyTooltip({ config, ...props }: React.ComponentProps<typeof ChartTooltipContent> & { config: ChartConfig }) {
  return (
    <ChartTooltipContent
      {...props}
      formatter={(value, name, item) => (
        <>
          <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: item.payload?.fill ?? item.color }} />
          <span className="text-muted-foreground">{config[String(name)]?.label ?? name}</span>
          <span className="ml-auto pl-3 font-medium text-foreground tabular-nums">{formatBs(Number(value))}</span>
        </>
      )}
    />
  );
}
