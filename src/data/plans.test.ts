// planLimits solo muestra los límites: la base los aplica. Este test avisa si dejan de coincidir.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bsTotal, discounted, planLimits, planUsd, usdFor } from "./plans";

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
  it("el aviso de cada cierre va en todos los planes", () => {
    expect(latest("private.on_shift_closed_notify")).not.toMatch(/'Gratis'/);
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
