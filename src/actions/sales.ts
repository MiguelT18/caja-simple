// Ventas y gastos: registrar, anular y corregir.
// Quién puede corregir lo decide la base: la dueña siempre; quien lo registró, mientras su turno sigue abierto.
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { check, db, extension, imageFile, name, uuid, uploadLimit } from "./shared";

const amount = z.coerce.number({ error: "Ingresa un monto" }).positive("El monto debe ser mayor a cero").max(9_999_999);
const expenseFields = {
  concept: name(120, "Ingresa el concepto"),
  category: name(40, "Ingresa la categoría"),
  amount,
};

// price: solo para productos con precio al vender; con precio fijo la base usa el del inventario.
export const saleItems = z
  .array(z.object({ productId: uuid, qty: z.number().int().min(1).max(10_000), price: z.number().positive("Escribe el precio").max(9_999_999).optional() }))
  .max(200, "La venta tiene demasiadas líneas (máximo 200)");
export const payment = z.enum(["efectivo", "qr", "transferencia"]).default("efectivo");

export const sales = {
  registerSale: defineAction({
    input: z.object({
      // Lo genera el navegador: si la misma venta llega dos veces, la base devuelve la primera.
      saleId: uuid,
      branchId: uuid,
      shiftId: uuid,
      payment,
      items: saleItems.min(1, "La venta no tiene productos"),
    }),
    handler: async ({ saleId, branchId, shiftId, payment, items }, context) => {
      const { data, error } = await db(context).rpc("register_sale", {
        p_sale: saleId,
        p_branch: branchId,
        p_shift: shiftId,
        p_payment: payment,
        p_items: items,
      });
      check(error);
      return { id: data };
    },
  }),

  /**
   * Comprobante de una venta por QR o transferencia: sube la imagen a <negocio>/<venta>/ y la base la anota en la venta
   * (quien la registró, una vez; la dueña, siempre). Se llama al cobrar y, si faltó, desde Ventas.
   */
  attachSaleReceipt: defineAction({
    accept: "form",
    input: z.object({
      saleId: uuid,
      image: imageFile.refine((f) => f && f.size > 0, "Elige la imagen del comprobante"),
    }),
    handler: async ({ saleId, image }, context) => {
      await uploadLimit(context, image);
      const sb = db(context);
      const { data: sale } = await sb.from("sales").select("branch_id").eq("id", saleId).maybeSingle();
      const { data: branch } = sale ? await sb.from("branches").select("business_id").eq("id", sale.branch_id).maybeSingle() : { data: null };
      if (!branch) throw new ActionError({ code: "NOT_FOUND", message: "Esa venta ya no existe." });
      const path = `${branch.business_id}/${saleId}/${crypto.randomUUID()}.${extension(image!.type)}`;
      const upload = await sb.storage.from("sale-receipts").upload(path, image!, { contentType: image!.type, cacheControl: "31536000" });
      if (upload.error) throw new ActionError({ code: "BAD_REQUEST", message: "No se pudo subir el comprobante. Intenta de nuevo." });
      // shortcut: si la base lo rechaza, la imagen queda huérfana en el bucket (solo la dueña borra); limpiar con un cron si crece.
      check((await sb.rpc("attach_sale_receipt", { p_sale: saleId, p_path: path })).error);
      return { ok: true };
    },
  }),

  /** Anula la venta (queda registrada) y devuelve el stock. */
  voidSale: defineAction({
    input: z.object({ saleId: uuid }),
    handler: async ({ saleId }, context) => {
      check((await db(context).rpc("void_sale", { p_sale: saleId })).error);
      return { ok: true };
    },
  }),

  createExpense: defineAction({
    accept: "form",
    input: z.object({ expenseId: uuid, branchId: uuid, shiftId: uuid, ...expenseFields }),
    handler: async ({ expenseId, branchId, shiftId, ...fields }, context) => {
      const { error } = await db(context).from("expenses").insert({ id: expenseId, branch_id: branchId, shift_id: shiftId, ...fields });
      // El mismo formulario enviado dos veces (doble clic, reintento): el gasto ya quedó guardado.
      if (error?.code === "23505" && error.message.includes("expenses_pkey")) return { ok: true };
      check(error);
      return { ok: true };
    },
  }),

  updateExpense: defineAction({
    accept: "form",
    input: z.object({ expenseId: uuid, ...expenseFields }),
    handler: async ({ expenseId, ...fields }, context) => {
      check((await db(context).from("expenses").update(fields).eq("id", expenseId).select("id").single()).error);
      return { ok: true };
    },
  }),

  /** Borrar un gasto es anularlo: queda registrado quién y cuándo. */
  voidExpense: defineAction({
    input: z.object({ expenseId: uuid }),
    handler: async ({ expenseId }, context) => {
      const { error } = await db(context)
        .from("expenses")
        .update({ voided_at: new Date().toISOString() })
        .eq("id", expenseId)
        .select("id")
        .single();
      check(error);
      return { ok: true };
    },
  }),
};
