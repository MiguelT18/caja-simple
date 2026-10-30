// Categorías de productos que arma cada negocio. Se guardan en el navegador.
// shortcut: localStorage es por navegador y por persona; cuando exista backend, esto pasa a la base de datos del negocio.

export interface Category {
  id: string;
  name: string;
}

export interface CategoryState {
  categories: Category[];
  // Productos movidos de su categoría original: id de producto → id de categoría (null = sin categoría).
  moved: Record<string, string | null>;
}

// Las categorías de los datos de ejemplo llevan id «d-…»; las que crea el usuario, «u-…».
export const defaultId = (name: string) => `d-${name.toLowerCase()}`;

export function initialState(products: { category: string }[]): CategoryState {
  const names = [...new Set(products.map((p) => p.category))];
  return { categories: names.map((name) => ({ id: defaultId(name), name })), moved: {} };
}

/** Categoría efectiva de un producto; si su categoría se borró, queda sin categoría. */
export function categoryOf(state: CategoryState, product: { id: string; category: string }): string | null {
  const id = product.id in state.moved ? state.moved[product.id] : defaultId(product.category);
  return id && state.categories.some((c) => c.id === id) ? id : null;
}

/** Devuelve el mensaje de error si el nombre no sirve, o null si está bien. */
export function nameError(state: CategoryState, name: string, exceptId?: string): string | null {
  const clean = name.trim();
  if (!clean) return "Escribe un nombre para la categoría.";
  if (clean.length > 30) return "Usa 30 caracteres o menos.";
  const taken = state.categories.some((c) => c.id !== exceptId && c.name.toLowerCase() === clean.toLowerCase());
  return taken ? `Ya existe la categoría «${clean}».` : null;
}

export function addCategory(state: CategoryState, name: string, id = `u-${Date.now().toString(36)}`): CategoryState {
  return { ...state, categories: [...state.categories, { id, name: name.trim() }] };
}

export function renameCategory(state: CategoryState, id: string, name: string): CategoryState {
  return { ...state, categories: state.categories.map((c) => (c.id === id ? { ...c, name: name.trim() } : c)) };
}

export function deleteCategory(state: CategoryState, id: string): CategoryState {
  const moved = Object.fromEntries(Object.entries(state.moved).map(([pid, cid]) => [pid, cid === id ? null : cid]));
  return { categories: state.categories.filter((c) => c.id !== id), moved };
}

export function moveProduct(state: CategoryState, productId: string, categoryId: string | null): CategoryState {
  return { ...state, moved: { ...state.moved, [productId]: categoryId } };
}

// La clave lleva el id del negocio: cada negocio tiene sus propias categorías.
export function loadState(key: string, fallback: CategoryState): CategoryState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const data = JSON.parse(raw);
    const ok =
      Array.isArray(data?.categories) &&
      data.categories.every((c: unknown) => typeof (c as Category)?.id === "string" && typeof (c as Category)?.name === "string") &&
      data.moved &&
      typeof data.moved === "object";
    return ok ? { categories: data.categories, moved: data.moved } : fallback;
  } catch {
    return fallback;
  }
}

export function saveState(key: string, state: CategoryState) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Sin almacenamiento (modo privado, bloqueado): los cambios duran hasta recargar.
  }
}
