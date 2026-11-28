/** Ancho del menú lateral en escritorio (SidebarResizer): límites en px y cookies que Layout lee para pintarlo. */
export const MENU_MIN = 200;
export const MENU_MAX = 420;
/** Arrastrado más angosto que esto, el menú se oculta al soltar. */
export const MENU_COLLAPSE_AT = 150;
export const MENU_WIDTH_COOKIE = "menu-ancho";
export const MENU_HIDDEN_COOKIE = "menu-oculto";

/** El ancho guardado en la cookie, dentro de los límites; undefined si no hay (o no es un número). */
export function menuWidth(value: string | undefined) {
  const px = Number(value);
  return value && Number.isFinite(px) ? Math.round(Math.min(MENU_MAX, Math.max(MENU_MIN, px))) : undefined;
}
