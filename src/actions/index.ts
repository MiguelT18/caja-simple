// Escrituras de /app. Ver docs/modelo-de-datos.md.
// RLS es la autorización real: las acciones validan la entrada y traducen los errores. Un archivo por dominio.
import { account } from "./account";
import { businesses } from "./businesses";
import { employees } from "./employees";
import { products } from "./products";
import { sales } from "./sales";
import { shifts } from "./shifts";

export const server = {
    ...businesses,
    ...shifts,
    ...sales,
    ...products,
    ...employees,
    ...account
};
