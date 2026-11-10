// Autocompletado de personas al invitar: sugiere cuentas por nombre o correo (actions.searchPeople) en el popover de
// PeopleSuggest.astro, que comparten todos los campos de la página. Elegir a alguien encontrado por su nombre guarda su
// cuenta en `personId` (el correo se ve enmascarado); por correo, el campo queda con el correo y personId vacío.
import { actions } from "astro:actions";
import { avatarColor } from "@/lib/format";

// byEmail: se encontró por su correo y se ve completo; si no, por su nombre, con el correo enmascarado.
type Person = { id: string; email: string; byEmail: boolean; name: string; avatarUrl?: string };
type Result = { people: Person[]; total: number; page: number };

const PAGE_SIZE = 5;
// Búsquedas ya hechas (por negocio): volver atrás o cambiar de página no espera a la red.
const cache = new Map<string, Result>();
/** El campo que tiene la lista abierta: los botones de página son del popover, no de cada campo. */
let current: { turn: (step: number) => void } | null = null;

/**
 * Conecta `input` con las sugerencias. Sin `businessId` (crear el primer negocio) busca sin negocio: la base lo deja
 * solo a quien todavía no es dueña de ninguno.
 */
export function peopleSearch(input: HTMLInputElement, personId: HTMLInputElement, businessId?: string) {
  const popover = document.getElementById("people-suggest");
  if (!popover) return;
  const list = popover.querySelector<HTMLElement>(".suggest-list")!;
  const skeleton = popover.querySelector<HTMLElement>(".suggest-skeleton")!;
  const empty = popover.querySelector<HTMLElement>(".suggest-empty")!;
  const pager = popover.querySelector<HTMLElement>(".suggest-pager")!;
  const pagerInfo = popover.querySelector<HTMLElement>(".pager-info")!;
  const [prev, next] = popover.querySelectorAll<HTMLButtonElement>(".pager-btn");
  const status = popover.querySelector<HTMLElement>("[data-status]")!;

  if (!popover.dataset.ready) {
    popover.dataset.ready = "true";
    for (const button of [prev, next]) {
      // mousedown: el foco se queda en el campo.
      button.addEventListener("mousedown", (e) => e.preventDefault());
      button.addEventListener("click", () => current?.turn(Number(button.dataset.step)));
    }
  }

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", "people-suggest-list");
  input.setAttribute("aria-expanded", "false");
  // Las teclas de la lista se anuncian aparte: en pantalla la pista queda corta.
  input.setAttribute("aria-describedby", `${input.getAttribute("aria-describedby") ?? ""} people-keys`.trim());

  let result: Result | null = null;
  let query = "";
  let active = -1;
  let timer: ReturnType<typeof setTimeout>;
  let request = 0;

  const pages = () => Math.max(1, Math.ceil((result?.total ?? 0) / PAGE_SIZE));
  const mine = () => current === controller;

  const open = () => {
    current = controller;
    const rect = input.getBoundingClientRect();
    popover.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - Math.max(rect.width, 280) - 8))}px`;
    popover.style.width = `${Math.min(Math.max(rect.width, 280), innerWidth - 16)}px`;
    if (!popover.matches(":popover-open")) popover.showPopover();
    // Debajo del campo; si no cabe (el campo está cerca del borde de abajo), arriba.
    const height = popover.offsetHeight;
    const below = rect.bottom + 4 + height <= innerHeight || rect.top - 4 - height < 0;
    popover.style.top = `${below ? rect.bottom + 4 : rect.top - 4 - height}px`;
    input.setAttribute("aria-expanded", "true");
  };

  const close = () => {
    clearTimeout(timer);
    request++;
    if (mine()) {
      if (popover.matches(":popover-open")) popover.hidePopover();
      current = null;
    }
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  };

  const show = (state: "loading" | "results") => {
    const loading = state === "loading";
    popover.setAttribute("aria-busy", String(loading));
    skeleton.hidden = !loading;
    list.hidden = loading || !result?.people.length;
    empty.hidden = loading || !!result?.people.length;
    pager.hidden = loading || pages() < 2;
  };

  const highlight = (index: number) => {
    active = index;
    list.querySelectorAll("[role=option]").forEach((el, i) => el.setAttribute("aria-selected", String(i === index)));
    if (index >= 0) input.setAttribute("aria-activedescendant", `person-${index}`);
    else input.removeAttribute("aria-activedescendant");
  };

  const choose = (index: number) => {
    const person = result?.people[index];
    if (!person) return;
    // Por correo, el campo queda con el correo y se invita con él. Por nombre, con el nombre y el correo
    // enmascarado a la vista, y se invita por la cuenta.
    input.value = person.byEmail ? person.email : `${person.name || person.email} · ${person.email}`;
    personId.value = person.byEmail ? "" : person.id;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    close();
  };

  const option = (p: Person, i: number) => {
    const li = document.createElement("li");
    li.id = `person-${i}`;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", "false");
    li.className = "suggest-option";
    // Como Avatar.astro: el ícono sobre el color de la persona y la foto encima; si no carga, queda el ícono.
    const avatar = Object.assign(document.createElement("span"), { className: "avatar-default" });
    avatar.setAttribute("aria-hidden", "true");
    avatar.style.setProperty("--avatar", avatarColor(p.id));
    avatar.append(document.querySelector<HTMLTemplateElement>("#avatar-icon")!.content.cloneNode(true));
    if (p.avatarUrl) {
      const img = Object.assign(document.createElement("img"), { src: p.avatarUrl, alt: "", referrerPolicy: "no-referrer" });
      img.addEventListener("error", () => (img.hidden = true));
      avatar.append(img);
    }
    const text = Object.assign(document.createElement("span"), { className: "suggest-text" });
    text.append(Object.assign(document.createElement("span"), { className: "suggest-name", textContent: p.name || p.email }));
    if (p.name) text.append(Object.assign(document.createElement("span"), { className: "suggest-email", textContent: p.email }));
    li.append(avatar, text);
    // mousedown: elige antes de que el campo pierda el foco.
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      choose(i);
    });
    return li;
  };

  const render = () => {
    if (!result) return;
    list.replaceChildren(...result.people.map(option));
    const from = (result.page - 1) * PAGE_SIZE + 1;
    const to = from + result.people.length - 1;
    pagerInfo.textContent = `${from}–${to} de ${result.total}`;
    prev.disabled = result.page <= 1;
    next.disabled = result.page >= pages();
    empty.textContent = `Ninguna cuenta registrada coincide con «${query}».`;
    status.textContent = result.total
      ? `${result.total} ${result.total === 1 ? "cuenta" : "cuentas"}. Página ${result.page} de ${pages()}.`
      : empty.textContent;
    highlight(-1);
    show("results");
    open();
  };

  const key = (q: string, page: number) => `${businessId ?? ""}|${q.toLowerCase()}|${page}`;

  const load = async (q: string, page: number) => {
    const ticket = ++request;
    const cached = cache.get(key(q, page));
    if (cached) {
      result = cached;
      return render();
    }
    show("loading");
    status.textContent = "Buscando cuentas…";
    open();
    const { data, error } = await actions.searchPeople({ businessId, query: q, page }).catch(() => ({ data: undefined, error: new Error("offline") }));
    // Solo cuenta la última búsqueda: las respuestas pueden llegar desordenadas.
    if (ticket !== request || !mine()) return;
    if (error || !data) {
      result = { people: [], total: 0, page };
      empty.textContent = "No se pudo buscar. Escribe su correo completo.";
      status.textContent = empty.textContent;
      return show("results");
    }
    cache.set(key(q, page), data);
    result = data;
    render();
  };

  const turn = (step: number) => {
    if (!result) return;
    const page = result.page + step;
    if (page < 1 || page > pages()) return;
    load(query, page);
  };
  const controller = { turn };

  input.addEventListener("input", () => {
    // Lo escrito ya no es la persona elegida.
    personId.value = "";
    clearTimeout(timer);
    query = input.value.trim();
    if (query.length < 3) return close();
    // El esqueleto aparece al instante; la consulta espera a que se deje de teclear un momento.
    if (!cache.has(key(query, 1))) {
      show("loading");
      open();
    }
    timer = setTimeout(() => load(query, 1), 200);
  });

  input.addEventListener("keydown", (e) => {
    if (!mine() || !popover.matches(":popover-open")) return;
    const count = result?.people.length ?? 0;
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && count) {
      e.preventDefault();
      highlight((active + (e.key === "ArrowDown" ? 1 : -1) + count) % count);
    } else if (e.key === "PageDown" || e.key === "PageUp") {
      e.preventDefault();
      turn(e.key === "PageDown" ? 1 : -1);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      // Cierra solo la lista, no el diálogo.
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });

  input.addEventListener("blur", close);
  input.closest("dialog")?.addEventListener("close", () => {
    close();
    personId.value = "";
  });
  window.addEventListener("resize", close);
  // Al desplazar, la lista (fija) se separaría del campo.
  document.querySelector("main")?.addEventListener("scroll", () => mine() && close(), { passive: true });
}
