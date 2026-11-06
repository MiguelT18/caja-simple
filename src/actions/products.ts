// Catálogo e inventario.
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { check, count, db, imageFile, money, name, optional, storeImage, uuid, uploadLimit } from "./shared";

export const products = {
  saveCategory: defineAction({
    input: z.object({ businessId: uuid, id: uuid.optional(), name: name(40, "Escribe un nombre") }),
    handler: async ({ businessId, id, name }, context) => {
      const sb = db(context);
      const duplicate = `Ya existe la categoría «${name}».`;
      if (id) {
        const { error } = await sb.from("categories").update({ name }).eq("id", id).select("id").single();
        check(error, duplicate);
        return { id, name };
      }
      const { data, error } = await sb.from("categories").insert({ business_id: businessId, name }).select("id, name").single();
      check(error, duplicate);
      return data!;
    },
  }),

  deleteCategory: defineAction({
    input: z.object({ id: uuid }),
    handler: async ({ id }, context) => {
      // Sus productos quedan «Sin categoría» (on delete set null).
      const { error } = await db(context).from("categories").delete().eq("id", id);
      check(error);
      return { ok: true };
    },
  }),

  moveProduct: defineAction({
    input: z.object({ productId: uuid, categoryId: uuid.nullable() }),
    handler: async ({ productId, categoryId }, context) => {
      const { error } = await db(context).from("products").update({ category_id: categoryId }).eq("id", productId).select("id").single();
      check(error);
      return { ok: true };
    },
  }),

  saveProduct: defineAction({
    accept: "form",
    input: z.object({
      businessId: uuid,
      id: uuid.optional(),
      name: name(80, "Ingresa el nombre del producto"),
      categoryId: uuid.nullish().transform((v) => v ?? undefined),
      barcode: optional.pipe(z.string().regex(/^\d{6,14}$/, "El código de barras solo lleva números (6 a 14)").optional()),
      description: optional.pipe(z.string().trim().max(500, "Máximo 500 caracteres").optional()),
      image: imageFile,
      removeImage: z.coerce.boolean().default(false),
    }),
    handler: async ({ businessId, id, name, categoryId, barcode, description, image, removeImage }, context) => {
      await uploadLimit(context, image);
      const sb = db(context);
      const fields = { name, category_id: categoryId ?? null, barcode: barcode ?? null, description: description || null };
      const duplicate = "Ya tienes otro producto con ese código de barras.";
      const saved = id
        ? await sb.from("products").update(fields).eq("id", id).select("id, image_path").single()
        : await sb.from("products").insert({ business_id: businessId, ...fields }).select("id, image_path").single();
      check(saved.error, duplicate);
      const product = saved.data!;

      await storeImage(sb, "products", businessId, product, image, removeImage);
      return { id: product.id };
    },
  }),

  /** Alta en lote desde un CSV (ver src/lib/csv.ts). Salta lo repetido para que reimportar el mismo archivo no duplique. */
  importProducts: defineAction({
    input: z.object({
      businessId: uuid,
      rows: z
        .array(
          z.object({
            name: name(80, "Falta el nombre"),
            barcode: z.string().regex(/^\d{6,14}$/).optional(),
            category: z.string().trim().min(1).max(40).optional(),
          }),
        )
        .min(1, "El archivo no tiene productos")
        .max(500, "Máximo 500 productos por archivo"),
    }),
    handler: async ({ businessId, rows }, context) => {
      const sb = db(context);
      const key = (s: string) => s.toLowerCase();
      const [existing, cats] = await Promise.all([
        sb.from("products").select("name, barcode").eq("business_id", businessId),
        sb.from("categories").select("id, name").eq("business_id", businessId),
      ]);
      check(existing.error);
      check(cats.error);
      const names = new Set(existing.data!.map((p) => key(p.name)));
      const barcodes = new Set(existing.data!.flatMap((p) => (p.barcode ? [p.barcode] : [])));
      const skipped: string[] = [];
      const fresh = rows.filter((r) => {
        if (names.has(key(r.name)) || (r.barcode && barcodes.has(r.barcode))) return !skipped.push(r.name);
        names.add(key(r.name));
        if (r.barcode) barcodes.add(r.barcode);
        return true;
      });

      // Las categorías que no existen se crean.
      const categoryId = new Map(cats.data!.map((c) => [key(c.name), c.id]));
      const missing = [...new Map(fresh.flatMap((r) => (r.category && !categoryId.has(key(r.category)) ? [[key(r.category), r.category]] : []))).values()];
      if (missing.length) {
        const { data, error } = await sb.from("categories").insert(missing.map((n) => ({ business_id: businessId, name: n }))).select("id, name");
        check(error);
        for (const c of data!) categoryId.set(key(c.name), c.id);
      }

      if (fresh.length) {
        const { error } = await sb.from("products").insert(
          fresh.map((r) => ({ business_id: businessId, name: r.name, barcode: r.barcode ?? null, category_id: r.category ? categoryId.get(key(r.category))! : null })),
        );
        check(error, "Otro producto ya tiene uno de esos códigos de barras.");
      }
      return { imported: fresh.length, skipped };
    },
  }),

  deleteProduct: defineAction({
    accept: "form",
    input: z.object({ id: uuid }),
    handler: async ({ id }, context) => {
      const sb = db(context);
      const { data, error } = await sb.from("products").delete().eq("id", id).select("image_path").single();
      if (error?.code === "23503")
        throw new ActionError({ code: "CONFLICT", message: "Este producto ya tiene ventas. Quítalo del inventario de cada sucursal en vez de borrarlo." });
      check(error);
      if (data?.image_path) await sb.storage.from("product-images").remove([data.image_path]);
      return { ok: true };
    },
  }),

  // Inventario

  saveInventory: defineAction({
    accept: "form",
    // Sin «Precio fijo» el precio va en null (se escribe al vender); sin «Controlar stock», stock y mínimo van en null.
    input: z
      .object({
        businessId: uuid,
        branchId: uuid,
        productId: uuid,
        fixedPrice: z.coerce.boolean().default(false),
        trackStock: z.coerce.boolean().default(false),
        price: money.optional(),
        stock: count.optional(),
        // El stock que mostraba el formulario al abrirse (si ya se controlaba): lo editado se aplica como ajuste.
        stockBefore: count.optional(),
        minStock: count.optional(),
      })
      .refine((v) => !v.fixedPrice || v.price !== undefined, { message: "Ingresa un monto", path: ["price"] })
      .refine((v) => !v.trackStock || v.stock !== undefined, { message: "Ingresa un número", path: ["stock"] })
      .refine((v) => !v.trackStock || v.minStock !== undefined, { message: "Ingresa un número", path: ["minStock"] }),
    handler: async ({ businessId, branchId, productId, fixedPrice, trackStock, price, stock, stockBefore, minStock }, context) => {
      const sb = db(context);
      // Ya se controlaba el stock: no se pisa (una venta mientras el formulario estaba abierto se perdería).
      // Se guarda el resto y, si la dueña cambió el número, la diferencia entra como ajuste registrado.
      if (trackStock && stockBefore !== undefined) {
        check(
          (
            await sb
              .from("inventory")
              .update({ price: fixedPrice ? price! : null, min_stock: minStock! })
              .eq("branch_id", branchId)
              .eq("product_id", productId)
              .select("product_id")
              .single()
          ).error,
        );
        const delta = stock! - stockBefore;
        if (delta !== 0) {
          const { error } = await sb.rpc("record_stock_move", {
            p_branch: branchId,
            p_product: productId,
            p_kind: "ajuste",
            p_qty: delta,
            p_reason: "Corrección desde el inventario",
          });
          check(error);
        }
        return { ok: true };
      }
      const { error } = await sb
        .from("inventory")
        .upsert({
          business_id: businessId,
          branch_id: branchId,
          product_id: productId,
          price: fixedPrice ? price! : null,
          stock: trackStock ? stock! : null,
          min_stock: trackStock ? minStock! : null,
        })
        .select("product_id")
        .single();
      check(error);
      return { ok: true };
    },
  }),

  /** Entrada de mercadería (cualquiera de la sucursal), merma o ajuste (la dueña). Cambia el stock y queda registrado. */
  recordStockMove: defineAction({
    accept: "form",
    input: z
      .object({
        branchId: uuid,
        productId: uuid,
        kind: z.enum(["entrada", "merma", "ajuste"]),
        qty: z.coerce.number({ error: "Ingresa un número" }).int("Usa un número entero").min(-100_000).max(100_000),
        reason: optional.pipe(z.string().max(120, "Máximo 120 caracteres").optional()),
      })
      .refine((v) => v.qty !== 0, { message: "La cantidad no puede ser 0", path: ["qty"] })
      .refine((v) => v.kind === "ajuste" || v.qty > 0, { message: "Usa un número mayor que 0", path: ["qty"] })
      .refine((v) => v.kind === "entrada" || v.reason, { message: "Escribe el motivo", path: ["reason"] }),
    handler: async ({ branchId, productId, kind, qty, reason }, context) => {
      const { error } = await db(context).rpc("record_stock_move", {
        p_branch: branchId,
        p_product: productId,
        p_kind: kind,
        p_qty: qty,
        p_reason: reason ?? "",
      });
      check(error);
      return { ok: true };
    },
  }),

  removeInventory: defineAction({
    accept: "form",
    input: z.object({ branchId: uuid, productId: uuid }),
    handler: async ({ branchId, productId }, context) => {
      const { error } = await db(context).from("inventory").delete().eq("branch_id", branchId).eq("product_id", productId);
      check(error);
      return { ok: true };
    },
  }),
};
