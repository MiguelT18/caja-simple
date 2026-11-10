// planLimits solo muestra los límites: la base los aplica. Este test avisa si dejan de coincidir.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bsTotal, daysLeft, discounted, effectivePlan, planLimits, planUsd, TRIAL_DAYS, untilLabel, usdFor } from "./plans";

const dir = new URL("../../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
/** El cuerpo vigente de una función: el de la última migración que la define. */
function latest(fn: string) {
  for (const f of [...files].reverse()) {
    const sql = readFileSync(new URL(f, dir), "utf8");
    const start = sql.search(new RegExp(`create (or replace )?function ${fn.replace(".", "\\.")}\\(`));
    if (start >= 0) return sql.slice(start, sql.indexOf("$$;", start));
  }
  throw new Error(`No encontré ${fn}`);
}

describe("planLimits coincide con la base", () => {
  it("historial de Gratis", () => {
    const days = Number(latest("private.history_start").match(/'Gratis' then private\.today\(\) - (\d+)/)?.[1]);
    expect(days).toBe(planLimits.Gratis.historyDays);
    expect(planLimits.Negocio.historyDays).toBeNull();
    expect(planLimits.Sucursales.historyDays).toBeNull();
  });
  it("solo Sucursales tiene más de 1 sucursal", () => {
    expect(latest("private.check_branch_limit")).toMatch(/v_plan <> 'Sucursales' and exists/);
    expect(planLimits.Gratis.branches).toBe(1);
    expect(planLimits.Negocio.branches).toBe(1);
    expect(planLimits.Sucursales.branches).toBeNull();
  });
  it("tope de productos, stock congelado y combos en Gratis", () => {
    const max = Number(latest("private.check_product_limit").match(/>= (\d+) then/)?.[1]);
    expect(max).toBe(planLimits.Gratis.products);
    expect(planLimits.Negocio.products).toBeNull();
    expect(latest("private.freeze_stock")).toMatch(/<> 'Gratis' then\s+return new/);
    expect(latest("private.take_stock")).toMatch(/effective_plan\(v_item\.business_id\) = 'Gratis'/);
    expect(latest("private.check_product_component")).toMatch(/= 'Gratis' then\s+raise exception 'Los combos/);
    expect([planLimits.Gratis.stock, planLimits.Gratis.bulk]).toEqual([false, false]);
    expect([planLimits.Negocio.stock, planLimits.Negocio.bulk]).toEqual([true, true]);
  });
  it("promociones solo en los planes pagos", () => {
    expect(latest("private.check_promotion_plan")).toMatch(/= 'Gratis' then\s+raise exception 'Las promociones/);
    expect(latest("private.promo_discount")).toMatch(/effective_plan\(p_business\) <> 'Gratis'/);
    expect([planLimits.Gratis.promotions, planLimits.Negocio.promotions, planLimits.Sucursales.promotions]).toEqual([false, true, true]);
  });
  it("la prueba dura TRIAL_DAYS (hoy + días − 1, como plan_until)", () => {
    const plus = Number(latest("private.start_trial").match(/private\.today\(\) \+ (\d+)/)?.[1]);
    expect(plus + 1).toBe(TRIAL_DAYS);
  });
  it("el aviso de cada cierre va en todos los planes", () => {
    expect(latest("private.on_shift_closed_notify")).not.toMatch(/'Gratis'/);
  });
});

describe("effectivePlan", () => {
  it("un plan vencido cuenta como Gratis; el último día todavía vale", () => {
    expect(effectivePlan("Negocio", "2026-11-07", "2026-11-08")).toBe("Gratis");
    expect(effectivePlan("Negocio", "2026-11-08", "2026-11-08")).toBe("Negocio");
    expect(effectivePlan("Sucursales", null, "2026-11-08")).toBe("Sucursales");
  });
});

describe("untilLabel", () => {
  it("la prueba cuenta los días que quedan, con hoy incluido", () => {
    expect(daysLeft("2026-12-07", "2026-11-08")).toBe(TRIAL_DAYS);
    expect(untilLabel({ planUntil: "2026-11-19", trial: true }, "2026-11-08")).toBe("prueba gratis, quedan 12 días");
    expect(untilLabel({ planUntil: "2026-11-08", trial: true }, "2026-11-08")).toBe("prueba gratis, último día");
    expect(untilLabel({}, "2026-11-08")).toBeNull();
  });
});

describe("precio en bolivianos (ejemplos del documento, TC 11,81 e impuestos 0,16)", () => {
  const bs = (usd: number) => bsTotal(usd, 11.81, 0.16);
  it("mensual", () => {
    expect(bs(usdFor("Negocio", "mensual"))).toBe(77);
    expect(bs(planUsd.extraBranch.mensual)).toBe(49);
    expect(bs(usdFor("Sucursales", "mensual", 2))).toBe(176); // 3 locales: US$ 12,50
  });
  it("anual", () => {
    expect(bs(usdFor("Negocio", "anual"))).toBe(773);
    expect(bs(planUsd.extraBranch.anual)).toBe(492);
  });
  it("Gratis no cuesta y Negocio no cobra sucursales extra", () => {
    expect(usdFor("Gratis", "mensual", 3)).toBe(0);
    expect(usdFor("Negocio", "mensual", 3)).toBe(5.5);
  });
});

describe("planUsd coincide con la base", () => {
  it("private.plan_usd y private.bs_total", () => {
    const m = latest("private.plan_usd").match(/'mensual' then ([\d.]+) \+ ([\d.]+) \* p_extra else ([\d.]+) \+ ([\d.]+) \* p_extra/);
    expect(m?.slice(1).map(Number)).toEqual([planUsd.base.mensual, planUsd.extraBranch.mensual, planUsd.base.anual, planUsd.extraBranch.anual]);
    expect(latest("private.bs_total")).toMatch(/round\(p_usd \* p_rate \/ \(1 - p_tax\)\)/);
  });
});

describe("precio fundador", () => {
  it("50%: redondeo a centavos y Bs con TC 11,81", () => {
    expect(discounted(5.5, 0.5)).toBe(2.75);
    expect(discounted(12.5, 0.5)).toBe(6.25);
    expect(bsTotal(discounted(usdFor("Negocio", "mensual"), 0.5), 11.81, 0.16)).toBe(39);
    expect(bsTotal(discounted(usdFor("Negocio", "anual"), 0.5), 11.81, 0.16)).toBe(387);
    expect(discounted(5.5, 0)).toBe(5.5);
  });
  it("la base aplica el mismo redondeo", () => {
    expect(latest("private.create_plan_charge")).toMatch(/round\(private\.plan_usd\(v_plan, p_period, v_extra\) \* \(1 - v_discount\), 2\)/);
  });
});

// Ver docs/planes-de-suscripcion.md › Límites en la app: ninguna función de pago queda abierta a Gratis.
describe("las funciones de pago miran el plan que vale hoy", () => {
  const sources = files.map((f) => readFileSync(new URL(f, dir), "utf8"));
  const defined = new Map<string, string>();
  for (const sql of sources)
    for (const m of sql.matchAll(/create (?:or replace )?function ([\w.]+)\(/g)) defined.set(m[1], sql.slice(m.index, sql.indexOf("$$;", m.index)));

  it("todo chequeo de plan usa private.effective_plan (un plan vencido sigue diciendo «Negocio» hasta plan_daily)", () => {
    // Las que cobran, vencen o dan la prueba miran el plan guardado a propósito. check_free_business ya no existe.
    const billing = ["private.effective_plan", "private.plan_daily", "private.plan_usd", "private.create_plan_charge", "private.start_trial", "private.check_free_business"];
    const raw = [...defined]
      .filter(([fn, body]) => !billing.includes(fn) && /'(Gratis|Negocio|Sucursales)'/.test(body) && !/private\.effective_plan\(/.test(body))
      .map(([fn]) => fn);
    expect(raw).toEqual([]);
  });

  it("nadie escribe el plan, su vencimiento, la prueba ni el cupo de fundador al crear un negocio", () => {
    const grants = sources.flatMap((sql) => [...sql.matchAll(/grant insert \(([^)]*)\) on public\.businesses/g)].map((m) => m[1]));
    for (const col of ["plan", "plan_until", "trial", "founder_since", "owner_id"]) expect(grants.at(-1)!.split(",").map((c) => c.trim())).not.toContain(col);
  });

  it("la prueba es una por persona", () => {
    expect(latest("private.start_trial")).toMatch(/insert into private\.trials/);
  });
});
