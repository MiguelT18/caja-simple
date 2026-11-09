import { actions } from "astro:actions";
import { Fragment, useRef, useState } from "react";
import { ChevronDown, ImagePlus } from "lucide-react";
import type { PaymentMethod, SaleLine, ShiftTone } from "@/data/types";
import { Button } from "@/components/ui/button";
import { formatBs, paymentLabel } from "@/lib/format";
import { confirmDialog, toast } from "@/scripts/dialogs";
import { refreshRegions } from "@/scripts/refresh";
import { shrinkImage } from "@/scripts/shrink-image";
import { safeAction } from "./products/form";
import { Table, TableCaption, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pager, usePage } from "./Pager";
import { ShiftBadge } from "./ShiftBadge";

export interface Movement {
  id: string;
  time: string;
  label: string;
  shift: { name: string; tone: ShiftTone };
  by: string;
  amount: number;
  kind: "sale" | "expense";
  /** Solo ventas. */
  payment?: PaymentMethod;
  /** Anulado: se ve tachado, con su rótulo, y no suma. */
  voided?: boolean;
  /** Muestra «Anular» (la base decide igual). */
  canVoid?: boolean;
  /** Lo que se vendió: la fila se puede desplegar. */
  detail?: SaleLine[];
  /** Enlace firmado al comprobante (ventas por QR o transferencia). */
  receipt?: string;
  /** QR o transferencia sin comprobante (se cobró sin conexión o falló la subida). */
  missingReceipt?: boolean;
  /** Muestra «Adjuntar» (la base decide igual). */
  canAttach?: boolean;
}

/** «Adjuntar» comprobante: elige la imagen, la achica y la sube; al terminar trae la tabla al día. */
function AttachReceipt({ saleId, label }: { saleId: string; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function upload(file: File) {
    setBusy(true);
    const form = new FormData();
    form.append("saleId", saleId);
    form.append("image", await shrinkImage(file));
    const { error } = await safeAction(() => actions.attachSaleReceipt(form));
    setBusy(false);
    if (input.current) input.current.value = "";
    if (error) return toast(error.message, "error");
    toast("Comprobante adjuntado.", "success");
    await refreshRegions();
  }
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
      <Button variant="ghost" size="sm" onClick={() => !busy && input.current?.click()} aria-busy={busy || undefined} aria-label={`Adjuntar comprobante: ${label}`}>
        <ImagePlus strokeWidth={1.75} aria-hidden="true" />
        {busy ? "Subiendo…" : "Adjuntar"}
      </Button>
    </>
  );
}

async function voidSale(m: Movement) {
  const ok = await confirmDialog(`La venta de ${formatBs(m.amount)} queda registrada como anulada y el stock vuelve al inventario.`, {
    title: "¿Anular la venta?",
    confirmLabel: "Anular venta",
    danger: true,
  });
  if (!ok) return;
  const { error } = await safeAction(() => actions.voidSale({ saleId: m.id }));
  if (error) return toast(error.message, "error");
  toast("Venta anulada.", "success");
  await refreshRegions();
}

/** Movimientos del día (ventas y gastos), los más recientes primero. */
export default function MovementsTable({
  rows,
  pageSize = 6,
  empty = "Todavía no hay ventas ni gastos hoy.",
  timeLabel = "Hora",
}: {
  rows: Movement[];
  pageSize?: number;
  empty?: string;
  /** «Cuándo» si `time` lleva también el día. */
  timeLabel?: string;
}) {
  const pager = usePage(rows, pageSize);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  if (rows.length === 0) return <p className="card empty-state">{empty}</p>;
  const withActions = rows.some((m) => m.canVoid);
  return (
    <div>
      <div className="table-wrap">
        <Table label="Movimientos">
          <TableCaption className="sr-only">Movimientos</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{timeLabel}</TableHead>
              <TableHead>Movimiento</TableHead>
              <TableHead>Turno</TableHead>
              <TableHead>Registró</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              {withActions && (
                <TableHead>
                  <span className="sr-only">Acciones</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pager.pageItems.map((m) => (
              <Fragment key={m.id}>
              <TableRow>
                <TableCell className="text-muted-foreground tabular-nums">{m.time}</TableCell>
                <TableCell>
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {m.detail?.length ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                        aria-expanded={open.has(m.id)}
                        aria-controls={`detail-${m.id}`}
                        aria-label={`Detalle: ${m.label}`}
                        onClick={() => toggle(m.id)}
                      >
                        {m.label}
                        <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" className={open.has(m.id) ? "rotate-180" : undefined} />
                      </button>
                    ) : (
                      m.label
                    )}
                    {m.payment && <span className="chip chip-neutral">{paymentLabel[m.payment]}</span>}
                    {m.voided && <span className="chip chip-warning">{m.kind === "sale" ? "Anulada" : "Anulado"}</span>}
                    {m.receipt && (
                      <a href={m.receipt} target="_blank" rel="noopener" className="chip chip-neutral underline-offset-4 hover:underline">
                        Comprobante<span className="sr-only"> (se abre en otra pestaña)</span>
                      </a>
                    )}
                    {m.missingReceipt && <span className="chip chip-warning">Sin comprobante</span>}
                    {m.canAttach && <AttachReceipt saleId={m.id} label={`${m.label}, ${m.time}`} />}
                  </span>
                </TableCell>
                <TableCell>
                  <ShiftBadge shift={m.shift} />
                </TableCell>
                <TableCell className="text-muted-foreground">{m.by}</TableCell>
                <TableCell
                  className={`text-right tabular-nums ${m.voided ? "text-muted-foreground line-through" : m.kind === "sale" ? "amount-income" : "amount-expense"}`}
                >
                  {m.voided && <span className="sr-only">Anulado, no cuenta: </span>}
                  {formatBs(m.amount, m.kind === "sale" ? "+" : "−")}
                </TableCell>
                {withActions && (
                  <TableCell className="text-right">
                    {m.canVoid && (
                      <Button variant="ghost" size="sm" onClick={() => voidSale(m)} aria-label={`Anular venta (${m.time})`}>
                        Anular
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
              {m.detail && open.has(m.id) && (
                <TableRow id={`detail-${m.id}`}>
                  <TableCell colSpan={withActions ? 6 : 5} className="bg-muted/40">
                    <ul className="grid gap-1 text-sm" aria-label="Detalle de la venta">
                      {m.detail.map((d, i) => (
                        <li key={i} className="flex justify-between gap-4">
                          <span>
                            {d.qty} × {d.name} <span className="text-muted-foreground tabular-nums">a {formatBs(d.price)}</span>
                            {d.discount > 0 && (
                              <span className="text-muted-foreground tabular-nums"> · {d.promo ?? "Promoción"} −{formatBs(d.discount)}</span>
                            )}
                          </span>
                          <span className="tabular-nums">{formatBs(d.qty * d.price - d.discount)}</span>
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                </TableRow>
              )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pager {...pager} onPage={pager.setPage} noun="movimientos" />
    </div>
  );
}
