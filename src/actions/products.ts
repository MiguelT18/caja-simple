// Catálogo e inventario.
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { check, count, db, imageFile, limitsOf, money, name, optional, storeImage, uuid, uploadLimit } from "./shared";

/** Fila de inventario como la guarda saveInventory: sin precio se cobra al vender; sin stock, no se controla. */
const inventoryRow = (businessId: string, branchId: string, productId: string, v: { price?: number; stock?: number; minStock?: number }) => ({
  business_id: businessId,
  branch_id: branchId,
  product_id: productId,
  price: v.price ?? null,
  stock: v.stock ?? null,
  min_stock: v.stock === undefined ? null : (v.minStock ?? 0),
});

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
      // Precio en cada sucursal donde ya se vende (mismo orden que priceBranch). Vacío: se escribe al vender.
      priceBranch: z.array(uuid).max(100).default([]),
      price: z.array(z.preprocess((v) => (v === "" || v == null ? undefined : v), money.optional())).max(100).default([]),
      // Combo: lo que incluye (mismo orden que componentQty). Al crearlo, priceBranch lo agrega a esas sucursales.
      combo: z.coerce.boolean().default(false),
      componentId: z.array(uuid).max(20, "Un combo incluye hasta 20 productos").default([]),
      componentQty: z.array(z.coerce.number({ error: "Ingresa un número" }).int("Usa un número entero").min(1, "Al menos 1").max(99, "Hasta 99")).max(20).default([]),
    })
      .refine((v) => v.price.length === v.priceBranch.length, { message: "Revisa los precios", path: ["price"] })
      .refine((v) => v.componentId.length === v.componentQty.length, { message: "Revisa las cantidades", path: ["components"] })
      .refine((v) => new Set(v.componentId).size === v.componentId.length, { message: "Hay un producto repetido", path: ["components"] })
      .refine((v) => !v.combo || v.componentQty.reduce((a, b) => a + b, 0) >= 2, { message: "Un combo lleva al menos dos productos", path: ["components"] }),
    handler: async ({ businessId, id, name, categoryId, barcode, description, image, removeImage, priceBranch, price, combo, componentId, componentQty }, context) => {
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
      if (combo) {
        if (id) check((await sb.from("product_components").delete().eq("combo_id", id)).error);
        const { error } = await sb
          .from("product_components")
          .insert(componentId.map((componentId, i) => ({ business_id: businessId, combo_id: product.id, component_id: componentId, qty: componentQty[i] })));
        // Un combo nuevo que no pudo armarse no queda como producto suelto.
        if (error && !id) await sb.from("products").delete().eq("id", product.id);
        check(error);
        // Un combo nuevo queda a la venta en las sucursales elegidas (sin stock propio: sale de sus productos).
        if (!id && priceBranch.length) {
          const { error } = await sb
            .from("inventory")
            .upsert(priceBranch.map((branchId, i) => inventoryRow(businessId, branchId, product.id, { price: price[i] })), { onConflict: "branch_id,product_id", ignoreDuplicates: true });
          check(error);
        }
      }
      // Solo filas que ya existen: agregar el producto a una sucursal sigue siendo desde su inventario.
      if (id) {
        const results = await Promise.all(
          priceBranch.map((branchId, i) => sb.from("inventory").update({ price: price[i] ?? null }).eq("branch_id", branchId).eq("product_id", id)),
        );
        for (const r of results) check(r.error);
      }
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
            price: money.optional(),
            stock: count.optional(),
            stockByBranch: z.record(uuid, count).optional(),
            minStock: count.optional(),
          }),
        )
        .min(1, "El archivo no tiene productos")
        .max(500, "Máximo 500 productos por archivo"),
      /** Sucursales a cuyo inventario entran los productos, con el precio y el stock de cada fila. */
      branchIds: z.array(uuid).max(50).default([]),
    }),
    handler: async ({ businessId, rows, branchIds }, context) => {
      const sb = db(context);
      // shortcut: solo la Action corta la importación (la base no distingue un alta de una importación); el tope de
      // 150 productos de Gratis sí lo aplica la base, así que saltarse esto no da más que cargar de a uno.
      if (!(await limitsOf(sb, businessId)).bulk)
        throw new ActionError({ code: "FORBIDDEN", message: "Importar productos es del plan Negocio. En el plan Gratis se agregan de a uno." });
      const key = (s: string) => s.toLowerCase();
      const [existing, cats] = await Promise.all([
        sb.from("products").select("id, name, barcode").eq("business_id", businessId),
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

      const productId = new Map(existing.data!.map((p) => [key(p.name), p.id]));
      const byBarcode = new Map(existing.data!.flatMap((p) => (p.barcode ? [[p.barcode, p.id]] : [])));
      if (fresh.length) {
        const { data, error } = await sb
          .from("products")
          .insert(
            fresh.map((r) => ({ business_id: businessId, name: r.name, barcode: r.barcode ?? null, category_id: r.category ? categoryId.get(key(r.category))! : null })),
          )
          .select("id, name");
        check(error, "Otro producto ya tiene uno de esos códigos de barras.");
        for (const p of data!) productId.set(key(p.name), p.id);
      }

      // Al inventario de cada sucursal elegida, también los que ya estaban en el catálogo. Lo que ya está en una
      // sucursal no se pisa: su stock cambia con las ventas y su precio lo pudo haber corregido la dueña.
      const toStock = new Map<string, (typeof rows)[number]>();
      if (branchIds.length)
        for (const r of rows) {
          const id = productId.get(key(r.name)) ?? (r.barcode ? byBarcode.get(r.barcode) : undefined);
          if (id && !toStock.has(id)) toStock.set(id, r);
        }
      const stocked = [...toStock].map(([id, r]) => ({ id, r }));
      if (stocked.length) {
        const { error } = await sb.from("inventory").upsert(
          // Con una columna por sucursal, cada una toma la suya; sin su número, esa sucursal no controla el stock.
          branchIds.flatMap((branchId) =>
            stocked.map(({ id, r }) => inventoryRow(businessId, branchId, id, { ...r, stock: r.stockByBranch ? r.stockByBranch[branchId] : r.stock })),
          ),
          { onConflict: "branch_id,product_id", ignoreDuplicates: true },
        );
        check(error);
      }
      return { imported: fresh.length, skipped, stocked: stocked.length };
    },
  }),

  deleteProduct: defineAction({
    accept: "form",
    input: z.object({ id: uuid }),
    handler: async ({ id }, context) => {
      const sb = db(context);
      const { data, error } = await sb.from("products").delete().eq("id", id).select("image_path").single();
      if (error?.code === "23503")
        throw new ActionError({
          code: "CONFLICT",
          message: error.message.includes("product_components")
            ? "Este producto está en un combo. Quítalo del combo antes de borrarlo."
            : "Este producto ya tiene ventas. Quítalo del inventario de cada sucursal en vez de borrarlo.",
        });
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
      // Gratis: el stock queda congelado (la base no deja cambiarlo). Se guarda solo el precio y el stock queda como estaba.
      if (!(await limitsOf(sb, businessId)).stock) {
        const { error } = await sb
          .from("inventory")
          .upsert({ business_id: businessId, branch_id: branchId, product_id: productId, price: fixedPrice ? price! : null })
          .select("product_id")
          .single();
        check(error);
        return { ok: true };
      }
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

  /** Varios productos del catálogo al inventario de una sucursal de una vez; lo que ya estaba ahí no se toca. */
  addToInventory: defineAction({
    input: z.object({
      businessId: uuid,
      branchId: uuid,
      items: z
        .array(z.object({ productId: uuid, price: money.optional(), stock: count.optional(), minStock: count.optional() }))
        .min(1, "Marca al menos un producto")
        .max(500, "Máximo 500 productos a la vez"),
    }),
    handler: async ({ businessId, branchId, items }, context) => {
      const sb = db(context);
      // Gratis: sin control de stock, entran solo con su precio.
      const withStock = (await limitsOf(sb, businessId)).stock;
      const { error } = await sb
        .from("inventory")
        .upsert(
          items.map((item) => inventoryRow(businessId, branchId, item.productId, withStock ? item : { price: item.price })),
          { onConflict: "branch_id,product_id", ignoreDuplicates: true },
        );
      check(error);
      return { added: items.length };
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
