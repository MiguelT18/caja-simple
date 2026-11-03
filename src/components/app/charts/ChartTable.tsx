import { formatBs } from "@/lib/format";

/**
 * Los datos del gráfico como tabla, solo para lectores de pantalla: el SVG queda oculto (aria-hidden) y esta tabla
 * cuenta lo mismo con texto, sin depender del color.
 */
export function ChartTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: { label: string; values: number[] }[] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">
            <span className="sr-only">Fila</span>
          </th>
          {columns.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <th scope="row">{r.label}</th>
            {r.values.map((v, i) => (
              <td key={columns[i]}>{formatBs(v)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Montos cortos para los ejes: «Bs 1,2 mil». */
const compact = new Intl.NumberFormat("es-BO", { notation: "compact", maximumFractionDigits: 1 });
export const axisBs = (value: number) => `Bs ${compact.format(value)}`;
