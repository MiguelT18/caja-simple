// Escrituras de /app. Ver docs/modelo-de-datos.md.
// RLS es la autorización real: las acciones validan la entrada y traducen los errores. Un archivo por dominio.
import { account } from "./account";
import { billing } from "./billing";
import { businesses } from "./businesses";
import { employees } from "./employees";
import { orders } from "./orders";
import { products } from "./products";
import { sales } from "./sales";
import { shifts } from "./shifts";

export const server = {
    ...businesses,
    ...billing,
    ...shifts,
    ...sales,
    ...orders,
    ...products,
    ...employees,
    ...account
};
