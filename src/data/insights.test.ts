import { describe, expect, it } from "vitest";
import { marketingIdeas, peakHour, trend, weekdayRange } from "./insights";
import { statsRange, type BusinessStats } from "./stats";

const empty: BusinessStats = { products: [], branches: [], hours: [], weekdays: [], pairs: [], quiet: [] };
const base = { previous: null, days: 30, today: "2026-11-08", branches: [], soldIn: new Map(), catalogHref: "/c" };

describe("marketingIdeas", () => {
  it("sin ventas no inventa ideas", () => {
    expect(marketingIdeas({ ...base, stats: empty })).toEqual([]);
  });

  it("combo solo con 3 o más ventas juntas", () => {
    const at = (times: number) => marketingIdeas({ ...base, stats: { ...empty, pairs: [{ a: "Pan", b: "Leche", times }] } }).map((i) => i.kind);
    expect(at(2)).toEqual([]);
    expect(at(3)).toEqual(["combo"]);
  });

  it("el combo enlaza al formulario ya lleno si trae los ids", () => {
    const [idea] = marketingIdeas({ ...base, stats: { ...empty, pairs: [{ a: "Pan", b: "Leche", aId: "x", bId: "y", times: 4 }] } });
    expect(idea.href).toBe(`${base.catalogHref}?combo=x,y`);
  });

  it("estrella ausente en otra sucursal", () => {
    const ideas = marketingIdeas({
      ...base,
      stats: { ...empty, products: [{ id: "p", name: "Pan", qty: 9, revenue: 90 }] },
      branches: [
        { id: "a", name: "Centro", inventoryHref: "/a" },
        { id: "b", name: "Norte", inventoryHref: "/b" },
      ],
      soldIn: new Map([["p", new Set(["a"])]]),
    });
    expect(ideas[0]).toMatchObject({ kind: "estrella", href: "/b" });
    expect(ideas[0].text).toContain("Norte");
  });

  it("día flojo desde 30 % bajo el mejor, por promedio", () => {
    const weekdays = [
      { dow: 5, revenue: 400, days: 4 }, // 100 por día
      { dow: 1, revenue: 280, days: 4 }, // 70 por día → 30 % menos
    ];
    const ideas = marketingIdeas({ ...base, stats: { ...empty, weekdays } });
    expect(ideas.map((i) => i.text)).toContain("Los lunes vendes 30 % menos que los viernes: prueba una promoción ese día.");
  });

  it("baja de 10 % o más frente al período anterior", () => {
    const stats = { ...empty, branches: [{ id: "a", revenue: 85, sales: 10 }] };
    expect(marketingIdeas({ ...base, stats, previous: 100 }).map((i) => i.kind)).toContain("baja");
    expect(marketingIdeas({ ...base, stats, previous: 90 }).map((i) => i.kind)).not.toContain("baja");
  });

  it("como mucho 4 ideas", () => {
    const stats: BusinessStats = {
      products: [{ id: "p", name: "Pan", qty: 9, revenue: 90 }],
      branches: [
        { id: "a", revenue: 100, sales: 2 },
        { id: "b", revenue: 10, sales: 2 },
      ],
      hours: [{ hour: 18, revenue: 100 }],
      weekdays: [
        { dow: 5, revenue: 100, days: 1 },
        { dow: 1, revenue: 10, days: 1 },
      ],
      pairs: [{ a: "Pan", b: "Leche", times: 5 }],
      quiet: [{ id: "q", name: "Té", stock: 4, lastSale: null }],
    };
    const branches = [
      { id: "a", name: "A", inventoryHref: "/a" },
      { id: "b", name: "B", inventoryHref: "/b" },
    ];
    expect(marketingIdeas({ ...base, stats, branches, previous: 1000 })).toHaveLength(4);
  });
});

describe("cuentas", () => {
  it("hora pico y su parte", () => expect(peakHour([{ hour: 9, revenue: 1 }, { hour: 18, revenue: 3 }])).toEqual({ hour: 18, share: 0.75 }));
  it("sin un segundo día no compara", () => expect(weekdayRange([{ dow: 1, revenue: 5, days: 1 }])).toBeNull());
  it("tendencia sin anterior es null", () => {
    expect(trend(10, null)).toBeNull();
    expect(trend(10, 0)).toBeNull();
    expect(trend(110, 100)).toBe(10);
  });
});

describe("statsRange", () => {
  it("30 días con el anterior del mismo largo", () => {
    expect(statsRange("30", "2026-11-08", null)).toMatchObject({ from: "2026-10-10", to: "2026-11-08", prev: { from: "2026-09-10", to: "2026-10-09" } });
  });
  it("«Todo» no tiene anterior", () => expect(statsRange("todo", "2026-11-08", null).prev).toBeUndefined());
  it("este año desde el 1 de enero", () => expect(statsRange("anio", "2026-11-08", null).from).toBe("2026-01-01"));
  it("Gratis: lo que el plan no ofrece cae en 30 días, y sin anterior fuera del historial", () => {
    expect(statsRange("todo", "2026-11-08", 60).period).toBe("30");
    expect(statsRange("30", "2026-11-08", 60).prev).toBeDefined();
    const sixty = statsRange("60", "2026-11-08", 60);
    expect(sixty.from).toBe("2026-09-10");
    expect(sixty.prev).toBeUndefined();
  });
});
