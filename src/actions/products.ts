// Catálogo e inventario.
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { check, count, db, imageFile, money, name, optional, storeImage, uuid } from "./shared";

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
      image: imageFile,
      removeImage: z.coerce.boolean().default(false),
    }),
    handler: async ({ businessId, id, name, categoryId, barcode, image, removeImage }, context) => {
      const sb = db(context);
      const fields = { name, category_id: categoryId ?? null, barcode: barcode ?? null };
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
        minStock: count.optional(),
      })
      .refine((v) => !v.fixedPrice || v.price !== undefined, { message: "Ingresa un monto", path: ["price"] })
      .refine((v) => !v.trackStock || v.stock !== undefined, { message: "Ingresa un número", path: ["stock"] })
      .refine((v) => !v.trackStock || v.minStock !== undefined, { message: "Ingresa un número", path: ["minStock"] }),
    handler: async ({ businessId, branchId, productId, fixedPrice, trackStock, price, stock, minStock }, context) => {
      const { error } = await db(context)
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
