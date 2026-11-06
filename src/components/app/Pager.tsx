import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem } from "@/components/ui/pagination";

export function usePage<T>(items: T[], size: number) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  // Si un filtro achica la lista, vuelve a una página que exista.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  const current = Math.min(page, pageCount);
  const start = (current - 1) * size;
  return {
    page: current,
    setPage,
    pageCount,
    pageItems: items.slice(start, start + size),
    from: items.length ? start + 1 : 0,
    to: Math.min(start + size, items.length),
    total: items.length,
  };
}

// Páginas a mostrar: la primera, la última y las vecinas de la actual; el resto se resume con «…».
export function pageList(page: number, count: number): (number | "gap")[] {
  const wanted = new Set([1, count, page - 1, page, page + 1].filter((p) => p >= 1 && p <= count));
  const sorted = [...wanted].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? ["gap" as const, p] : [p]));
}

interface PagerProps {
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
  onPage: (page: number) => void;
  noun?: string;
}

export function Pager({ page, pageCount, from, to, total, onPage, noun = "resultados" }: PagerProps) {
  const root = useRef<HTMLDivElement>(null);
  if (pageCount <= 1) return null;

  /** Cambia de página y lleva la vista y el foco al inicio de la lista (si no, quedan abajo, en el paginador). */
  const go = (target: number) => {
    if (target < 1 || target > pageCount || target === page) return;
    onPage(target);
    const list = root.current?.parentElement;
    if (!list) return;
    list.tabIndex = -1;
    list.focus({ preventScroll: true });
    const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    // En escritorio solo se desplaza <main>: scrollIntoView también movía el viewport (el overflow del body pasa a él) y subía toda la app.
    const main = list.closest("main");
    if (main && getComputedStyle(main).overflowY !== "visible") {
      main.scrollTo({ top: main.scrollTop + list.getBoundingClientRect().top - main.getBoundingClientRect().top, behavior });
    } else {
      list.scrollIntoView({ block: "start", behavior });
    }
  };

  return (
    <div ref={root} className="flex flex-wrap items-center justify-between gap-3 pt-4">
      <p className="m-0 text-sm text-muted-foreground tabular-nums" aria-live="polite">
        {from}–{to} de {total} {noun}
      </p>
      <Pagination className="mx-0 w-auto" aria-label={`Paginación de ${noun}`}>
        <PaginationContent>
          <PaginationItem>
            <Button variant="ghost" size="sm" className="pointer-coarse:h-11 pointer-coarse:px-3" onClick={() => go(page - 1)} aria-disabled={page === 1 || undefined} aria-label="Página anterior">
              <ChevronLeft />
              <span className="hidden sm:inline">Anterior</span>
            </Button>
          </PaginationItem>
          {pageList(page, pageCount).map((p, i) =>
            p === "gap" ? (
              <PaginationItem key={`gap-${i}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={p}>
                <Button
                  variant={p === page ? "outline" : "ghost"}
                  size="icon-sm"
                  aria-current={p === page ? "page" : undefined}
                  aria-label={`Página ${p}`}
                  onClick={() => go(p)}
                  className="tabular-nums pointer-coarse:size-11"
                >
                  {p}
                </Button>
              </PaginationItem>
            ),
          )}
          <PaginationItem>
            <Button variant="ghost" size="sm" className="pointer-coarse:h-11 pointer-coarse:px-3" onClick={() => go(page + 1)} aria-disabled={page === pageCount || undefined} aria-label="Página siguiente">
              <span className="hidden sm:inline">Siguiente</span>
              <ChevronRight />
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
